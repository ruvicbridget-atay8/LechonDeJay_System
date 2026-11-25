import os
import sys
from contextlib import contextmanager
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
    assert "role LIKE %s" in query["sql"]
    assert query["params"] == ("%test%", "%test%", "%test%")


# Checks exact role filtering. Expected: role is combined with text search using bound parameters.
def test_list_users_filters_by_role_and_search(monkeypatch):
    from app.services import account_service

    query = {}

    def fake_fetch_all(sql, params):
        query["sql"] = sql
        query["params"] = params
        return []

    monkeypatch.setattr(account_service, "fetch_all", fake_fetch_all)

    account_service.list_users("Alice", "Cashier")

    assert "role = %s" in query["sql"]
    assert query["params"] == ("%Alice%", "%Alice%", "%Alice%", "Cashier")


# Checks role filter validation. Expected: unsupported roles are rejected with HTTP 400.
def test_list_users_rejects_unknown_role():
    from app.services import account_service

    with pytest.raises(account_service.DatabaseError) as error:
        account_service.list_users(role="Manager")

    assert error.value.status == 400
