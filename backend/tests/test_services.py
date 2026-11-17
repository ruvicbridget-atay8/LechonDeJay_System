import os
import sys
from contextlib import contextmanager
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from werkzeug.security import check_password_hash

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def _transaction_with(cursor):
    @contextmanager
    def transaction():
        yield cursor

    return transaction()


# Checks account creation. Expected: Active user insert with a verifiable hash, never the plain password.
def test_create_user_hashes_password_and_sets_active(monkeypatch):
    from app.services import account_service

    cursor = MagicMock()
    cursor.lastrowid = 23
    monkeypatch.setattr(
        account_service,
        "db_transaction",
        lambda: _transaction_with(cursor),
    )

    user_id = account_service.create_user(
        "Test User",
        "testuser",
        "secret-password",
        "Cashier",
        "555-0123",
    )

    statement, params = cursor.execute.call_args.args
    assert user_id == 23
    assert "'Active'" in statement
    assert params[:2] == ("Test User", "testuser")
    assert check_password_hash(params[2], "secret-password")
    assert params[2] != "secret-password"
    assert params[3:] == ("Cashier", "555-0123")


# Checks account deactivation. Expected: the account is set to Deactivated, not deleted.
def test_deactivate_user_updates_status(monkeypatch):
    from app.services import account_service

    cursor = MagicMock()
    cursor.fetchone.return_value = {
        "user_id": 23,
        "account_status": "Active",
    }
    monkeypatch.setattr(
        account_service,
        "db_transaction",
        lambda: _transaction_with(cursor),
    )

    result = account_service.deactivate_user("23")

    assert result == {"user_id": 23, "account_status": "Deactivated"}
    update_sql, params = cursor.execute.call_args.args
    assert "UPDATE users" in update_sql
    assert "SET account_status = 'Deactivated'" in update_sql
    assert params == (23,)


# Checks user search. Expected: matching rows use bound parameters and omit password hashes.
def test_list_users_searches_without_returning_password_hash(monkeypatch):
    from app.services import account_service

    query = {}
    rows = [{"user_id": 23, "username": "testuser"}]

    def fake_fetch_all(sql, params):
        query["sql"] = sql
        query["params"] = params
        return rows

    monkeypatch.setattr(account_service, "fetch_all", fake_fetch_all)

    result = account_service.list_users(" test ")

    assert result == rows
    assert "password_hash" not in query["sql"]
    assert query["params"] == ("%test%", "%test%", "%test%")


# Checks category deletion protection. Expected: linked products cause a safe 409 and no delete query.
def test_delete_category_with_products_is_blocked(monkeypatch):
    from app.services import config_service

    cursor = MagicMock()
    cursor.fetchone.side_effect = [
        {"category_id": 4},
        {"product_count": 2},
    ]
    monkeypatch.setattr(
        config_service,
        "db_transaction",
        lambda: _transaction_with(cursor),
    )

    with pytest.raises(config_service.DatabaseError) as error:
        config_service.delete_category(4)

    assert error.value.status == 409
    assert "still has products" in error.value.message
    assert all("DELETE FROM categories" not in call.args[0] for call in cursor.execute.call_args_list)


# Checks discount creation rules. Expected: valid values are Decimals; Regular cannot have a nonzero value.
def test_discount_type_creation_validates_values(monkeypatch):
    from app.services import config_service

    cursor = MagicMock()
    cursor.lastrowid = 8
    monkeypatch.setattr(
        config_service,
        "db_transaction",
        lambda: _transaction_with(cursor),
    )

    discount_id = config_service.create_discount_type("Senior Citizen", "20.00")

    assert discount_id == 8
    assert cursor.execute.call_args.args[1] == ("Senior Citizen", Decimal("20.00"))

    with pytest.raises(config_service.DatabaseError) as error:
        config_service.create_discount_type("Regular", "1.00")
    assert error.value.status == 400
    assert error.value.message == "The Regular discount type must have a value of 0."
