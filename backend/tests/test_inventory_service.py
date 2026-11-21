from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import MagicMock

import pytest


def _transaction_with(cursor):
    @contextmanager
    def transaction():
        yield cursor

    return transaction()


def _product_data(**overrides):
    product = {
        "sku": "meal-001",
        "name": "Lechon Meal",
        "category_id": 1,
        "price": "129.00",
        "unit": "piece",
        "product_type": "Finished Good",
        "current_stock": "3.00",
        "reorder_level": "5.00",
        "expiry_date": "2026-12-01",
    }
    product.update(overrides)
    return product


# Checks product creation with opening stock. Expected: product ID 15 and a Stock In/Delivery movement for 3.00.
def test_create_product_records_opening_stock_as_delivery(monkeypatch):
    from app.services import inventory_service

    cursor = MagicMock()
    cursor.lastrowid = 15
    cursor.fetchone.side_effect = [
        {"category_name": "Meals"},
        {"current_stock": Decimal("3.00")},
    ]
    monkeypatch.setattr(
        inventory_service,
        "db_transaction",
        lambda: _transaction_with(cursor),
    )

    product_id = inventory_service.create_product(_product_data(), 7)

    assert product_id == 15
    product_insert = next(
        call.args for call in cursor.execute.call_args_list
        if "INSERT INTO products" in call.args[0]
    )
    assert "current_stock" not in product_insert[0]
    movement_insert = next(
        call.args for call in cursor.execute.call_args_list
        if "INSERT INTO stock_movement" in call.args[0]
    )
    assert movement_insert[1] == (
        15,
        7,
        "Stock In",
        Decimal("3.00"),
        "Delivery",
    )
    assert any("INSERT INTO manages" in call.args[0] for call in cursor.execute.call_args_list)


# Checks add-on product persistence. Expected: the product insert records the boolean flag.
def test_create_product_persists_addon_flag(monkeypatch):
    from app.services import inventory_service

    cursor = MagicMock()
    cursor.lastrowid = 15
    cursor.fetchone.side_effect = [{"category_name": "Meals"}]
    monkeypatch.setattr(
        inventory_service,
        "db_transaction",
        lambda: _transaction_with(cursor),
    )

    inventory_service.create_product(_product_data(is_addon=True, current_stock="0"), 7)

    product_insert = next(
        call.args for call in cursor.execute.call_args_list
        if "INSERT INTO products" in call.args[0]
    )
    assert "is_addon" in product_insert[0]
    assert product_insert[1][8] is True


def test_product_addon_flag_must_be_boolean():
    from app.services import inventory_service

    cursor = MagicMock()
    cursor.fetchone.return_value = {"category_name": "Meals"}

    with pytest.raises(inventory_service.DatabaseError, match="is_addon must be a boolean"):
        inventory_service.normalize_product(
            cursor,
            _product_data(is_addon="yes"),
        )


# Checks editing stock from 10.00 to 8.00. Expected: a -2.00 Count Correction adjustment, not a direct stock update.
def test_update_product_records_stock_difference_as_adjustment(monkeypatch):
    from app.services import inventory_service

    existing = {
        "product_id": 15,
        "sku": "MEAL-001",
        "name": "Lechon Meal",
        "category_id": 1,
        "price": Decimal("129.00"),
        "unit": "piece",
        "product_type": "Finished Good",
        "current_stock": Decimal("10.00"),
        "reorder_level": Decimal("5.00"),
        "status": "Available",
        "size": None,
        "kilos": None,
        "serving_pax": None,
        "expiry_date": None,
    }
    cursor = MagicMock()
    cursor.fetchone.side_effect = [
        existing,
        {"category_name": "Meals"},
        {"current_stock": Decimal("8.00")},
    ]
    monkeypatch.setattr(
        inventory_service,
        "db_transaction",
        lambda: _transaction_with(cursor),
    )

    product_id = inventory_service.update_product(
        15,
        7,
        {"current_stock": "8.00", "is_addon": True},
    )

    assert product_id == 15
    update_call = next(
        call.args for call in cursor.execute.call_args_list
        if "UPDATE products" in call.args[0]
    )
    assert "current_stock =" not in update_call[0]
    assert "is_addon = %s" in update_call[0]
    assert update_call[1][7] is True
    movement_insert = next(
        call.args for call in cursor.execute.call_args_list
        if "INSERT INTO stock_movement" in call.args[0]
    )
    assert movement_insert[1] == (
        15,
        7,
        "Adjustment",
        Decimal("-2.00"),
        "Count Correction",
    )


# Checks reason/type validation. Expected: Stock Out with Delivery raises HTTP 400 before opening a transaction.
def test_manual_movement_rejects_reason_for_wrong_movement_type(monkeypatch):
    from app.services import inventory_service

    monkeypatch.setattr(
        inventory_service,
        "db_transaction",
        lambda: pytest.fail("invalid reasons must be rejected before opening a transaction"),
    )

    with pytest.raises(inventory_service.DatabaseError) as error:
        inventory_service.log_manual_movement(
            15,
            7,
            "Stock Out",
            "1.00",
            "Delivery",
        )

    assert error.value.status == 400


# Checks a full stock-out movement. Expected: stock becomes 0.00 and product status becomes Unavailable.
def test_manual_movement_records_stock_out_and_updates_unavailable_status(monkeypatch):
    from app.services import inventory_service

    cursor = MagicMock()
    cursor.lastrowid = 31
    cursor.fetchone.side_effect = [
        {
            "product_id": 15,
            "current_stock": Decimal("5.00"),
            "status": "Available",
        },
        {"current_stock": Decimal("0.00")},
    ]
    monkeypatch.setattr(
        inventory_service,
        "db_transaction",
        lambda: _transaction_with(cursor),
    )

    result = inventory_service.log_manual_movement(
        15,
        7,
        "Stock Out",
        "5.00",
        "Spoilage",
    )

    assert result["previous_stock"] == "5.00"
    assert result["new_stock"] == "0.00"
    movement_insert = next(
        call.args for call in cursor.execute.call_args_list
        if "INSERT INTO stock_movement" in call.args[0]
    )
    assert movement_insert[1] == (
        15,
        7,
        "Stock Out",
        Decimal("5.00"),
        "Spoilage",
    )
    assert any(
        "UPDATE products SET status = %s" in call.args[0]
        and call.args[1] == ("Unavailable", 15)
        for call in cursor.execute.call_args_list
    )


# Checks product archiving. Expected: status becomes Archived, a manage record is written, and no delete runs.
def test_archive_product_updates_status_without_deleting(monkeypatch):
    from app.services import inventory_service

    cursor = MagicMock()
    cursor.fetchone.return_value = {"status": "Available"}
    monkeypatch.setattr(
        inventory_service,
        "db_transaction",
        lambda: _transaction_with(cursor),
    )

    result = inventory_service.archive_product(15, 7)

    assert result == {"product_id": 15, "status": "Archived"}
    statements = [call.args[0] for call in cursor.execute.call_args_list]
    assert any("UPDATE products SET status = 'Archived'" in sql for sql in statements)
    assert all("DELETE" not in sql for sql in statements)
    assert any(
        "INSERT INTO manages" in sql and call.args[1][-1] == "archive"
        for sql, call in zip(statements, cursor.execute.call_args_list)
    )


# Checks catalog/search/stock flag filters. Expected: available finished goods only in catalog and matching search/flag SQL.
def test_catalog_and_stock_flags_filter_correctly(monkeypatch):
    from app.services import inventory_service

    calls = []

    def fake_fetch_all(query, params=()):
        calls.append((query, params))
        return []

    monkeypatch.setattr(inventory_service, "fetch_all", fake_fetch_all)

    inventory_service.get_catalog()
    inventory_service.search_products("meal")
    inventory_service.get_low_stock_products()
    inventory_service.get_expired_products()

    catalog_query, _ = calls[0]
    assert "p.status = 'Available'" in catalog_query
    assert "p.product_type = 'Finished Good'" in catalog_query
    assert "is_low_stock" in catalog_query
    assert "is_expired" in catalog_query
    assert "p.is_addon" in catalog_query

    search_query, search_params = calls[1]
    assert "p.sku LIKE %s" in search_query
    assert search_params == ("%meal%", "%meal%", "%meal%")

    low_stock_query, _ = calls[2]
    assert "p.current_stock <= p.reorder_level" in low_stock_query
    assert "p.status <> 'Archived'" in low_stock_query

    expired_query, _ = calls[3]
    assert "p.expiry_date < CURDATE()" in expired_query


def test_product_reads_return_addon_flags_as_booleans(monkeypatch):
    from app.services import inventory_service

    monkeypatch.setattr(
        inventory_service,
        "fetch_all",
        lambda *_: [{"is_addon": 1}, {"is_addon": 0}],
    )
    monkeypatch.setattr(
        inventory_service,
        "fetch_one",
        lambda *_: {"is_addon": 1},
    )

    products = inventory_service.get_catalog()
    assert [product["is_addon"] for product in products] == [True, False]
    assert inventory_service.get_product_by_sku("MEAL-001")["is_addon"] is True


# Checks movement history includes product SKU and the recorded user's full name.
def test_stock_movement_history_includes_sku_and_staff_name(monkeypatch):
    from app.services import inventory_service

    captured = {}

    def fake_fetch_all(query, params=()):
        captured["query"] = query
        captured["params"] = params
        return []

    monkeypatch.setattr(inventory_service, "fetch_all", fake_fetch_all)

    inventory_service.get_stock_movements()

    assert "p.sku" in captured["query"]
    assert "u.full_name AS staff_name" in captured["query"]
    assert "JOIN users u" in captured["query"]
