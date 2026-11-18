from flask import Blueprint, jsonify, request, session

from app.services import inventory_service
from app.services.auth_service import role_required
from app.services.database_service import DatabaseError
from app.routes.serialization import json_safe


inventory_bp = Blueprint("inventory", __name__, url_prefix="/inventory")


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
    if set(data) - {"price", "reorder_level", "status"}:
        return jsonify({
            "success": False,
            "message": "Only price, reorder_level, and status can be edited here.",
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