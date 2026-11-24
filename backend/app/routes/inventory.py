from io import BytesIO
import os
import struct
import zlib

import cloudinary
import cloudinary.uploader
from cloudinary.exceptions import Error as CloudinaryError
from flask import Blueprint, current_app, jsonify, request, session

from config import Config
from app.services import inventory_service
from app.services import role_required
from app.services import DatabaseError
from app.routes import json_safe


inventory_bp = Blueprint("inventory", __name__, url_prefix="/inventory")
MAX_PRODUCT_IMAGE_SIZE = 2 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}


def _detect_image_format(contents):
    if contents.startswith(b"\x89PNG\r\n\x1a\n"):
        offset = 8
        saw_header = False
        saw_data = False
        while offset + 12 <= len(contents):
            length = struct.unpack(">I", contents[offset : offset + 4])[0]
            chunk_type = contents[offset + 4 : offset + 8]
            chunk_end = offset + 8 + length
            if chunk_end + 4 > len(contents):
                return None
            chunk_data = contents[offset + 8 : chunk_end]
            expected_crc = struct.unpack(">I", contents[chunk_end : chunk_end + 4])[0]
            if zlib.crc32(chunk_type + chunk_data) & 0xFFFFFFFF != expected_crc:
                return None
            if chunk_type == b"IHDR":
                if saw_header or length != 13:
                    return None
                width, height = struct.unpack(">II", chunk_data[:8])
                if not width or not height:
                    return None
                saw_header = True
            elif chunk_type == b"IDAT":
                saw_data = True
            elif chunk_type == b"IEND":
                return (
                    "PNG"
                    if saw_header and saw_data and length == 0 and chunk_end + 4 == len(contents)
                    else None
                )
            offset = chunk_end + 4
        return None

    if contents.startswith(b"RIFF") and contents[8:12] == b"WEBP":
        if len(contents) < 20 or struct.unpack("<I", contents[4:8])[0] + 8 != len(contents):
            return None
        chunk_type = contents[12:16]
        chunk_size = struct.unpack("<I", contents[16:20])[0]
        if chunk_type not in {b"VP8 ", b"VP8L", b"VP8X"}:
            return None
        if chunk_size < 1 or 20 + chunk_size > len(contents):
            return None
        return "WEBP"

    if contents.startswith(b"\xff\xd8\xff") and contents.endswith(b"\xff\xd9"):
        offset = 2
        has_frame = False
        while offset + 4 <= len(contents):
            if contents[offset] != 0xFF:
                return None
            while offset < len(contents) and contents[offset] == 0xFF:
                offset += 1
            if offset >= len(contents):
                return None
            marker = contents[offset]
            offset += 1
            if marker == 0xDA:
                return "JPEG" if has_frame and offset < len(contents) - 2 else None
            if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7 or marker == 0x01:
                continue
            if offset + 2 > len(contents):
                return None
            segment_length = struct.unpack(">H", contents[offset : offset + 2])[0]
            if segment_length < 2 or offset + segment_length > len(contents):
                return None
            if marker in {
                0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
            }:
                if segment_length < 8:
                    return None
                height, width = struct.unpack(">HH", contents[offset + 3 : offset + 7])
                if not width or not height:
                    return None
                has_frame = True
            offset += segment_length
    return None


@inventory_bp.route("/config", methods=["GET"])
@role_required("Cashier", "Admin")
def inventory_config():
    return jsonify({
        "success": True,
        "data": {"cloud_name": Config.CLOUDINARY_CLOUD_NAME or ""},
    })


@inventory_bp.route("/products/<int:product_id>/image", methods=["POST"])
@role_required("Admin")
def upload_product_image(product_id):
    product = inventory_service.get_product_stock(product_id)
    image_file = request.files.get("image")
    if image_file is None or not image_file.filename:
        raise DatabaseError("Choose an image file to upload.", 400)

    extension = os.path.splitext(image_file.filename)[1].lower().lstrip(".")
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise DatabaseError("Image must be a JPG, JPEG, PNG, or WebP file.", 400)

    contents = image_file.read(MAX_PRODUCT_IMAGE_SIZE + 1)
    if len(contents) > MAX_PRODUCT_IMAGE_SIZE:
        raise DatabaseError("Image must be 2 MB or smaller.", 400)

    image_format = _detect_image_format(contents)
    if image_format is None:
        raise DatabaseError("The uploaded file is not a valid image.", 400) from None

    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise DatabaseError("Image content must be JPG, PNG, or WebP.", 400)
    expected_format = {
        "jpg": "JPEG",
        "jpeg": "JPEG",
        "png": "PNG",
        "webp": "WEBP",
    }[extension]
    if image_format != expected_format:
        raise DatabaseError("Image extension does not match its content.", 400)

    cloudinary_settings = (
        Config.CLOUDINARY_CLOUD_NAME,
        Config.CLOUDINARY_API_KEY,
        Config.CLOUDINARY_API_SECRET,
    )
    if not all(cloudinary_settings):
        raise DatabaseError(
            "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and "
            "CLOUDINARY_API_SECRET in backend/.env.",
            503,
        )

    cloudinary.config(
        cloud_name=Config.CLOUDINARY_CLOUD_NAME,
        api_key=Config.CLOUDINARY_API_KEY,
        api_secret=Config.CLOUDINARY_API_SECRET,
        secure=True,
    )
    public_id = f"lechon-de-jay/products/{product['sku']}"
    try:
        result = cloudinary.uploader.upload(
            BytesIO(contents),
            public_id=public_id,
            overwrite=True,
            invalidate=True,
            resource_type="image",
        )
    except CloudinaryError:
        current_app.logger.warning("Cloudinary product image upload failed.")
        raise DatabaseError("Image upload failed. Please try again.", 502) from None

    return jsonify({
        "success": True,
        "data": {
            "sku": product["sku"],
            "version": result.get("version"),
            "url": result.get("secure_url"),
        },
    })


@inventory_bp.route("", methods=["GET"])
@role_required("Cashier", "Admin")
def list_inventory():
    products = inventory_service.search_products(request.args.get("search"))
    return jsonify(json_safe({"success": True, "products": products}))


@inventory_bp.route("/catalog", methods=["GET"])
@role_required("Cashier", "Admin")
def inventory_catalog():
    products = inventory_service.get_catalog()
    return jsonify(json_safe({"success": True, "products": products}))


@inventory_bp.route("/low-stock", methods=["GET"])
@role_required("Cashier", "Admin")
def low_stock():
    return jsonify(json_safe({
        "success": True,
        "low_stock": inventory_service.get_low_stock_products(),
        "expired": inventory_service.get_expired_products(),
    }))


@inventory_bp.route("/<sku>", methods=["GET"])
@role_required("Cashier", "Admin")
def get_inventory_product(sku):
    product = inventory_service.get_product_by_sku(sku)
    return jsonify(json_safe({"success": True, "product": product}))


@inventory_bp.route("/sku", methods=["GET"])
@role_required("Cashier", "Admin")
def get_inventory_product_by_sku_query():
    sku = request.args.get("sku")
    if not sku or not sku.strip():
        return jsonify({
            "success": False,
            "message": "A sku query parameter is required.",
        }), 400
    product = inventory_service.get_product_by_sku(sku)
    return jsonify(json_safe({"success": True, "product": product}))


@inventory_bp.route("", methods=["POST"])
@role_required("Admin")
def create_inventory_product():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "A JSON object is required.",
        }), 400

    product_id = inventory_service.create_product(data, session["user_id"])
    product = inventory_service.get_product_by_sku(data["sku"])
    return jsonify(json_safe({
        "success": True,
        "message": "Product created successfully.",
        "product_id": product_id,
        "product": product,
    })), 201


@inventory_bp.route("/<sku>", methods=["PUT"])
@role_required("Admin")
def edit_inventory_product(sku):
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        return jsonify({
            "success": False,
            "message": "A non-empty JSON object is required.",
        }), 400
    if set(data) - {"price", "reorder_level", "status", "is_addon"}:
        return jsonify({
            "success": False,
            "message": (
                "Only price, reorder_level, status, and is_addon "
                "can be edited here."
            ),
        }), 400
    if "status" in data and (
        not isinstance(data["status"], str)
        or data["status"] not in {"Available", "Unavailable"}
    ):
        raise DatabaseError("Status must be Available or Unavailable.", 400)

    product = inventory_service.get_product_by_sku(sku)
    inventory_service.update_product(
        product["product_id"],
        session["user_id"],
        data,
    )
    updated_product = inventory_service.get_product_by_sku(sku)
    return jsonify(json_safe({
        "success": True,
        "message": "Product updated successfully.",
        "product": updated_product,
    }))


@inventory_bp.route("/<sku>/archive", methods=["PATCH"])
@role_required("Admin")
def archive_inventory_product(sku):
    product = inventory_service.get_product_by_sku(sku)
    archived = inventory_service.archive_product(
        product["product_id"],
        session["user_id"],
    )
    return jsonify({
        "success": True,
        "message": "Product archived successfully.",
        "product": archived,
    })


@inventory_bp.route("/<sku>/restore", methods=["PATCH"])
@role_required("Admin")
def restore_inventory_product(sku):
    product = inventory_service.get_product_by_sku(sku)
    restored = inventory_service.restore_product(
        product["product_id"],
        session["user_id"],
    )
    return jsonify({
        "success": True,
        "message": "Product restored successfully.",
        "product": restored,
    })