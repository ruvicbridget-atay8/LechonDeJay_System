import sys
import os
from unittest.mock import MagicMock

import pytest

# Ensure Python can find the backend module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import run

app = run.app

# Checks the health endpoint. Expected: HTTP 200 with {"status": "ok"}.
def test_health_endpoint():
    client = app.test_client()
    response = client.get('/health')
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


# Checks unauthenticated status and role restrictions for auth endpoints.
def test_auth_endpoints_report_unauthenticated_and_reject_disallowed_users(monkeypatch):
    from app.services import auth_service

    client = app.test_client()
    me_response = client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.get_json() == {
        "success": False,
        "message": "Login required",
        "authenticated": False,
    }
    assert client.post("/auth/logout").status_code == 401

    monkeypatch.setattr(
        auth_service,
        "_get_account",
        lambda user_id: {
            "user_id": user_id,
            "full_name": "Test User",
            "username": "test",
            "role": "Manager",
            "account_status": "Active",
        },
    )
    with client.session_transaction() as session:
        session["user_id"] = 1

    assert client.get("/auth/me").status_code == 403
    assert client.post("/auth/logout").status_code == 403


# Checks allowed roles. Expected: Cashier/Admin can view /me and logout clears the session.
@pytest.mark.parametrize("role", ["Cashier", "Admin"])
def test_cashier_and_admin_can_access_auth_endpoints(monkeypatch, role):
    from app.services import auth_service

    monkeypatch.setattr(
        auth_service,
        "_get_account",
        lambda user_id: {
            "user_id": user_id,
            "full_name": "Test User",
            "username": "test",
            "role": role,
            "account_status": "Active",
        },
    )
    client = app.test_client()
    with client.session_transaction() as session:
        session["user_id"] = 1

    response = client.get("/auth/me")
    assert response.status_code == 200
    assert response.get_json()["role"] == role
    assert response.get_json()["account_status"] == "Active"
    assert list(response.get_json()) == [
        "success",
        "message",
        "full_name",
        "role",
        "user_id",
        "username",
        "account_status",
        "authenticated",
    ]

    response = client.post("/auth/logout")
    assert response.status_code == 200
    assert list(response.get_json()) == ["success", "message"]
    with client.session_transaction() as session:
        assert "user_id" not in session


# Checks public login. Expected: HTTP 200, a session is created, and no password hash is returned.
def test_login_is_public_and_creates_session(monkeypatch):
    from app.routes import auth

    monkeypatch.setattr(
        auth,
        "authenticate",
        lambda username, password: {
            "user_id": 1,
            "username": username,
            "full_name": "Test User",
            "role": "Cashier",
            "account_status": "Active",
            "password_hash": "not-returned",
        },
    )
    client = app.test_client()

    response = client.post(
        "/auth/login",
        json={"username": "test", "password": "password"},
    )

    assert response.status_code == 200
    assert response.get_json()["message"] == "Login successful"
    assert list(response.get_json()) == [
        "success",
        "message",
        "full_name",
        "role",
        "user_id",
        "username",
        "account_status",
    ]
    assert "password_hash" not in response.get_json()
    with client.session_transaction() as session:
        assert session["user_id"] == 1
        assert session["role"] == "Cashier"


# Checks database probe failures. Expected: HTTP 503 with a generic message, not internal error details.
def test_database_test_hides_error_details(monkeypatch):
    def fail_probe(sql):
        raise RuntimeError("private database details")

    monkeypatch.setattr(run, "fetch_one", fail_probe)
    response = app.test_client().get("/database-test")

    assert response.status_code == 503
    assert response.get_json() == {
        "status": "error",
        "message": "Database unavailable.",
    }


# Checks transaction/error handling. Expected: commit or rollback correctly; unknown trigger text is replaced with a safe 400.
def test_db_transaction_commits_or_rolls_back_safely(monkeypatch):
    from app.services import database_service

    success_cursor = MagicMock()
    success_connection = MagicMock()
    success_connection.cursor.return_value = success_cursor
    error_cursor = MagicMock()
    error_connection = MagicMock()
    error_connection.cursor.return_value = error_cursor
    connections = iter((success_connection, error_connection))
    monkeypatch.setattr(database_service, "get_connection", lambda: next(connections))

    with database_service.db_transaction() as transaction_cursor:
        assert transaction_cursor is success_cursor

    success_connection.commit.assert_called_once()
    success_connection.rollback.assert_not_called()
    success_cursor.close.assert_called_once()
    success_connection.close.assert_called_once()

    with pytest.raises(database_service.DatabaseError) as error:
        with database_service.db_transaction():
            raise database_service.mysql.connector.Error(
                msg="duplicate key details",
                errno=1062,
            )

    assert error.value.status == 409
    assert error.value.message == "That value already exists."
    error_connection.rollback.assert_called_once()
    error_connection.commit.assert_not_called()
    error_cursor.close.assert_called_once()
    error_connection.close.assert_called_once()

    username_conflict = database_service.translate_error(
        database_service.mysql.connector.Error(
            msg="Duplicate entry 'test_003' for key 'users.username'",
            errno=1062,
        )
    )
    assert username_conflict.status == 409
    assert username_conflict.message == (
        "Username already exists. Please choose a different username."
    )

    approved_signal = database_service.translate_error(
        database_service.mysql.connector.Error(
            msg="Not enough stock for this movement.",
            errno=1644,
        )
    )
    assert approved_signal.message == "Not enough stock for this movement."

    unknown_signal = database_service.translate_error(
        database_service.mysql.connector.Error(
            msg="private database details",
            errno=1644,
        )
    )
    assert unknown_signal.status == 400
    assert unknown_signal.message == "The operation was rejected by a business rule."