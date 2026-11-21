import os
import sys
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import Mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import run


app = run.app


def _account(role):
    return {
        "user_id": 7,
        "full_name": "Test User",
        "username": "testuser",
        "role": role,
        "account_status": "Active",
    }


def _login_as(client, user_id=7):
    with client.session_transaction() as session:
        session["user_id"] = user_id


# Checks inventory read access and query forwarding. Expected: Cashier can search, browse catalog, view flags and fetch by SKU.
def test_inventory_read_endpoints_allow_cashier_and_forward_queries(monkeypatch):
    from app.routes import inventory
    from app.services import auth_service

    account = _account("Cashier")
    monkeypatch.setattr(auth_service, "_get_account", lambda _: account)
    search = Mock(return_value=[{"sku": "RM-001"}])
    catalog = Mock(return_value=[{"sku": "MEAL-001"}])
    low_stock = Mock(return_value=[{"sku": "RM-002", "is_low_stock": True}])
    expired = Mock(return_value=[{"sku": "RM-003", "is_expired": True}])
    by_sku = Mock(return_value={
        "sku": "MEAL-001",
        "price": Decimal("129.00"),
        "expiry_date": date(2026, 12, 1),
    })
    monkeypatch.setattr(inventory.inventory_service, "search_products", search)
    monkeypatch.setattr(inventory.inventory_service, "get_catalog", catalog)
    monkeypatch.setattr(inventory.inventory_service, "get_low_stock_products", low_stock)
    monkeypatch.setattr(inventory.inventory_service, "get_expired_products", expired)
    monkeypatch.setattr(inventory.inventory_service, "get_product_by_sku", by_sku)

    client = app.test_client()
    assert client.get("/inventory").status_code == 401
    _login_as(client)

    response = client.get("/inventory?search=rice")
    assert response.status_code == 200
    assert response.get_json()["products"] == [{"sku": "RM-001"}]
    search.assert_called_once_with("rice")

    assert client.get("/inventory/catalog").get_json()["products"] == [
        {"sku": "MEAL-001"}
    ]
    flags = client.get("/inventory/low-stock").get_json()
    assert flags["low_stock"] == [{"sku": "RM-002", "is_low_stock": True}]
    assert flags["expired"] == [{"sku": "RM-003", "is_expired": True}]
    product = client.get("/inventory/MEAL-001").get_json()["product"]
    assert product == {
        "sku": "MEAL-001",
        "price": "129.00",
        "expiry_date": "2026-12-01",
    }
    assert client.get("/inventory/sku?sku=MEAL-001").status_code == 200
    assert client.get("/inventory/sku").status_code == 400
    assert by_sku.call_count == 2
    by_sku.assert_called_with("MEAL-001")


# Checks Admin-only product mutations. Expected: Cashier receives 403; Admin can create, edit allowed fields, and archive.
def test_inventory_mutations_are_admin_only(monkeypatch):
    from app.routes import inventory
    from app.services import auth_service

    account = _account("Cashier")
    monkeypatch.setattr(auth_service, "_get_account", lambda _: account)
    create_product = Mock(return_value=15)
    get_product = Mock(return_value={"product_id": 15, "sku": "MEAL-001"})
    update_product = Mock(return_value=15)
    archive_product = Mock(return_value={"product_id": 15, "status": "Archived"})
    monkeypatch.setattr(inventory.inventory_service, "create_product", create_product)
    monkeypatch.setattr(inventory.inventory_service, "get_product_by_sku", get_product)
    monkeypatch.setattr(inventory.inventory_service, "update_product", update_product)
    monkeypatch.setattr(inventory.inventory_service, "archive_product", archive_product)

    client = app.test_client()
    _login_as(client)
    payload = {"sku": "MEAL-001"}
    assert client.post("/inventory", json=payload).status_code == 403
    assert client.put("/inventory/MEAL-001", json={"price": "120.00"}).status_code == 403
    assert client.patch("/inventory/MEAL-001/archive").status_code == 403
    create_product.assert_not_called()
    update_product.assert_not_called()
    archive_product.assert_not_called()

    account["role"] = "Admin"
    response = client.post("/inventory", json=payload)
    assert response.status_code == 201
    assert response.get_json()["product_id"] == 15
    create_product.assert_called_once_with(payload, 7)

    response = client.put(
        "/inventory/MEAL-001",
        json={"price": "120.00", "status": "Available"},
    )
    assert response.status_code == 200
    update_product.assert_called_once_with(
        15,
        7,
        {"price": "120.00", "status": "Available"},
    )

    response = client.patch("/inventory/MEAL-001/archive")
    assert response.status_code == 200
    archive_product.assert_called_once_with(15, 7)


def test_restore_product_is_admin_only_and_returns_updated_product(monkeypatch):
    from app.routes import inventory
    from app.services import auth_service

    account = _account("Cashier")
    monkeypatch.setattr(auth_service, "_get_account", lambda _: account)
    get_product = Mock(return_value={"product_id": 15, "sku": "MEAL-001"})
    restore_product = Mock(
        return_value={"product_id": 15, "status": "Available"},
    )
    monkeypatch.setattr(inventory.inventory_service, "get_product_by_sku", get_product)
    monkeypatch.setattr(inventory.inventory_service, "restore_product", restore_product)

    client = app.test_client()
    assert client.patch("/inventory/MEAL-001/restore").status_code == 401
    _login_as(client)
    assert client.patch("/inventory/MEAL-001/restore").status_code == 403
    get_product.assert_not_called()
    restore_product.assert_not_called()

    account["role"] = "Admin"
    response = client.patch("/inventory/MEAL-001/restore")

    assert response.status_code == 200
    assert response.get_json() == {
        "success": True,
        "message": "Product restored successfully.",
        "product": {"product_id": 15, "status": "Available"},
    }
    get_product.assert_called_once_with("MEAL-001")
    restore_product.assert_called_once_with(15, 7)


def test_restore_product_returns_404_for_unknown_sku(monkeypatch):
    from app.routes import inventory
    from app.services import auth_service

    monkeypatch.setattr(auth_service, "_get_account", lambda _: _account("Admin"))
    monkeypatch.setattr(
        inventory.inventory_service,
        "get_product_by_sku",
        Mock(side_effect=inventory.inventory_service.DatabaseError(
            "Product not found.",
            404,
        )),
    )
    client = app.test_client()
    _login_as(client)

    response = client.patch("/inventory/MISSING/restore")

    assert response.status_code == 404
    assert response.get_json() == {
        "success": False,
        "message": "Product not found.",
    }


def test_restore_product_rejects_non_archived_product(monkeypatch):
    from app.routes import inventory
    from app.services import auth_service

    monkeypatch.setattr(auth_service, "_get_account", lambda _: _account("Admin"))
    monkeypatch.setattr(
        inventory.inventory_service,
        "get_product_by_sku",
        Mock(return_value={"product_id": 15, "sku": "MEAL-001"}),
    )
    monkeypatch.setattr(
        inventory.inventory_service,
        "restore_product",
        Mock(side_effect=inventory.inventory_service.DatabaseError(
            "Only archived products can be restored.",
            400,
        )),
    )
    client = app.test_client()
    _login_as(client)

    response = client.patch("/inventory/MEAL-001/restore")

    assert response.status_code == 400
    assert response.get_json() == {
        "success": False,
        "message": "Only archived products can be restored.",
    }


# Checks stock movement creation and history filtering. Expected: Admin identity and SKU resolve to the service; dates/types are normalized.
def test_stock_movement_endpoints_are_admin_only_and_filter_history(monkeypatch):
    from app.routes import stock
    from app.services import auth_service

    account = _account("Cashier")
    monkeypatch.setattr(auth_service, "_get_account", lambda _: account)
    get_product = Mock(return_value={"product_id": 15, "sku": "MEAL-001"})
    log_movement = Mock(return_value={"movement_id": 31})
    list_movements = Mock(return_value=[{
        "movement_id": 31,
        "date_time": datetime(2026, 11, 19, 3, 0),
    }])
    monkeypatch.setattr(stock.inventory_service, "get_product_by_sku", get_product)
    monkeypatch.setattr(stock.inventory_service, "log_manual_movement", log_movement)
    monkeypatch.setattr(stock.inventory_service, "get_stock_movements", list_movements)

    client = app.test_client()
    _login_as(client)
    movement = {
        "sku": "MEAL-001",
        "movement_type": "out",
        "quantity": "2.00",
        "reason": "Spoilage",
    }
    assert client.post("/stock/movements", json=movement).status_code == 403
    assert client.get("/stock/movements").status_code == 403
    log_movement.assert_not_called()
    list_movements.assert_not_called()

    account["role"] = "Admin"
    response = client.post("/stock/movements", json=movement)
    assert response.status_code == 201
    log_movement.assert_called_once_with(
        product_id=15,
        user_id=7,
        movement_type="Stock Out",
        quantity="2.00",
        reason="Spoilage",
    )

    response = client.get(
        "/stock/movements?sku=MEAL-001&movement_type=adjustment"
        "&start_date=2026-11-01&end_date=2026-11-19"
    )
    assert response.status_code == 200
    assert response.get_json()["movements"][0]["date_time"] == "2026-11-19 03:00:00"
    list_movements.assert_called_once_with(
        sku="MEAL-001",
        movement_type="Adjustment",
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 19),
    )


# Checks malformed stock movement requests and filters. Expected: invalid movement types and dates return HTTP 400.
def test_stock_routes_reject_invalid_movement_type_and_dates(monkeypatch):
    from app.services import auth_service

    monkeypatch.setattr(auth_service, "_get_account", lambda _: _account("Admin"))
    client = app.test_client()
    _login_as(client)

    response = client.post(
        "/stock/movements",
        json={
            "product_id": 15,
            "movement_type": "unknown",
            "quantity": "1.00",
            "reason": "Delivery",
        },
    )
    assert response.status_code == 400

    response = client.get("/stock/movements?start_date=not-a-date")
    assert response.status_code == 400
