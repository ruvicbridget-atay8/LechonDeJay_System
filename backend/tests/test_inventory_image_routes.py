from io import BytesIO
import os
import struct
import sys
import zlib
from unittest.mock import Mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import run


app = run.app


def _login_as(client, role, monkeypatch):
    from app.services import auth_service

    account = {
        "user_id": 7,
        "full_name": "Test Admin",
        "username": "testuser",
        "role": role,
        "account_status": "Active",
    }
    monkeypatch.setattr(auth_service, "_get_account", lambda _user_id: account)
    with client.session_transaction() as session:
        session["user_id"] = 7
    return account


def _png_bytes():
    def chunk(name, data):
        body = name + data
        return (
            struct.pack(">I", len(data))
            + body
            + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    pixels = zlib.compress(b"\x00\xff\x00\x00")
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", pixels)
        + chunk(b"IEND", b"")
    )


def _upload(client, payload, filename="product.png"):
    return client.post(
        "/inventory/products/15/image",
        data={"image": (BytesIO(payload), filename)},
        content_type="multipart/form-data",
    )


def test_admin_can_upload_product_image(monkeypatch):
    from app.routes import inventory

    client = app.test_client()
    _login_as(client, "Admin", monkeypatch)
    monkeypatch.setattr(
        inventory.inventory_service,
        "get_product_stock",
        Mock(return_value={"product_id": 15, "sku": "MEAL-015"}),
    )
    uploader = Mock(
        return_value={
            "version": 12345,
            "secure_url": "https://res.cloudinary.com/demo/image/upload/v12345/meal.jpg",
        }
    )
    monkeypatch.setattr(inventory.cloudinary.uploader, "upload", uploader)
    monkeypatch.setattr(inventory.cloudinary, "config", Mock())
    monkeypatch.setattr(inventory.Config, "CLOUDINARY_CLOUD_NAME", "demo")
    monkeypatch.setattr(inventory.Config, "CLOUDINARY_API_KEY", "test-key")
    monkeypatch.setattr(inventory.Config, "CLOUDINARY_API_SECRET", "test-secret")

    response = _upload(client, _png_bytes())

    assert response.status_code == 200
    assert response.json == {
        "success": True,
        "data": {
            "sku": "MEAL-015",
            "version": 12345,
            "url": "https://res.cloudinary.com/demo/image/upload/v12345/meal.jpg",
        },
    }
    assert uploader.call_args.kwargs == {
        "public_id": "lechon-de-jay/products/MEAL-015",
        "overwrite": True,
        "invalidate": True,
        "resource_type": "image",
    }


def test_cashier_cannot_upload_product_image(monkeypatch):
    from app.routes import inventory

    client = app.test_client()
    _login_as(client, "Cashier", monkeypatch)
    get_product = Mock()
    monkeypatch.setattr(inventory.inventory_service, "get_product_stock", get_product)

    response = _upload(client, _png_bytes())

    assert response.status_code == 403
    get_product.assert_not_called()


def test_upload_rejects_wrong_file_type(monkeypatch):
    from app.routes import inventory
    client = app.test_client()
    _login_as(client, "Admin", monkeypatch)
    monkeypatch.setattr(
        inventory.inventory_service,
        "get_product_stock",
        Mock(return_value={"product_id": 15, "sku": "MEAL-015"}),
    )

    response = _upload(client, b"not an image", "notes.txt")

    assert response.status_code == 400
    assert "JPG, JPEG, PNG, or WebP" in response.json["message"]


def test_upload_rejects_image_over_2_mb(monkeypatch):
    from app.routes import inventory

    client = app.test_client()
    _login_as(client, "Admin", monkeypatch)
    monkeypatch.setattr(
        inventory.inventory_service,
        "get_product_stock",
        Mock(return_value={"product_id": 15, "sku": "MEAL-015"}),
    )

    response = _upload(client, b"x" * (2 * 1024 * 1024 + 1))

    assert response.status_code == 400
    assert response.json["message"] == "Image must be 2 MB or smaller."


def test_upload_returns_404_for_unknown_product(monkeypatch):
    from app.routes import inventory

    client = app.test_client()
    _login_as(client, "Admin", monkeypatch)
    monkeypatch.setattr(
        inventory.inventory_service,
        "get_product_stock",
        Mock(
            side_effect=inventory.inventory_service.DatabaseError(
                "Product not found.",
                404,
            )
        ),
    )

    response = _upload(client, _png_bytes())

    assert response.status_code == 404
    assert response.json["message"] == "Product not found."
