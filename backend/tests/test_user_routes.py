import os
import sys
from unittest.mock import Mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import run

app = run.app


def _account(role):
    return {
        "user_id": 1,
        "full_name": "Test Admin",
        "username": "testadmin",
        "role": role,
        "account_status": "Active",
    }


def _login_as(client, user_id=1):
    with client.session_transaction() as session:
        session["user_id"] = user_id


# Checks GET /users access and search. Expected: 401 unauthenticated, 403 for Cashier, 200 for Admin.
def test_list_users_is_admin_only_and_passes_search(monkeypatch):
    from app.routes import users
    from app.services import auth_service

    account = _account("Cashier")
    monkeypatch.setattr(auth_service, "_get_account", lambda user_id: account)
    requested_search = {}

    def list_users(search, role):
        requested_search["search"] = search
        requested_search["role"] = role
        return []

    monkeypatch.setattr(users.account_service, "list_users", list_users)

    client = app.test_client()
    assert client.get("/users").status_code == 401
    _login_as(client)
    assert client.get("/users").status_code == 403

    account["role"] = "Admin"
    response = client.get("/users?search=alice")

    assert response.status_code == 200
    assert requested_search["search"] == "alice"
    assert requested_search["role"] is None

    response = client.get("/users?role=Cashier")
    assert response.status_code == 200
    assert requested_search["search"] is None
    assert requested_search["role"] == "Cashier"


# Checks account creation. Expected: Admin receives HTTP 201 and the service gets the submitted fields.
def test_create_user_is_admin_only(monkeypatch):
    from app.routes import users
    from app.services import auth_service

    monkeypatch.setattr(auth_service, "_get_account", lambda user_id: _account("Admin"))
    received = {}

    def create_user(**fields):
        received.update(fields)
        return 42

    monkeypatch.setattr(users.account_service, "create_user", create_user)
    client = app.test_client()
    _login_as(client)

    response = client.post(
        "/users",
        json={
            "full_name": "Alice Example",
            "username": "alice",
            "password": "test-password",
            "role": "Cashier",
            "contact_number": "555-0123",
        },
    )

    assert response.status_code == 201
    assert response.get_json()["user_id"] == 42
    assert "password" not in response.get_json()
    assert received["username"] == "alice"
    assert received["password"] == "test-password"


# Checks malformed create requests. Expected: HTTP 400 without calling account creation.
def test_create_user_rejects_non_object_json(monkeypatch):
    from app.routes import users
    from app.services import auth_service

    monkeypatch.setattr(auth_service, "_get_account", lambda user_id: _account("Admin"))
    create_user = Mock()
    monkeypatch.setattr(users.account_service, "create_user", create_user)
    client = app.test_client()
    _login_as(client)

    response = client.post(
        "/users",
        data="[",
        content_type="application/json",
    )

    assert response.status_code == 400
    create_user.assert_not_called()


# Checks deactivation access. Expected: Cashier gets 403; Admin gets 200 and the target ID is passed to the service.
def test_deactivate_user_is_admin_only(monkeypatch):
    from app.routes import users
    from app.services import auth_service

    account = _account("Cashier")
    monkeypatch.setattr(auth_service, "_get_account", lambda user_id: account)
    deactivated = []
    monkeypatch.setattr(
        users.account_service,
        "deactivate_user",
        lambda user_id: deactivated.append(user_id) or {
            "user_id": user_id,
            "account_status": "Deactivated",
        },
    )
    client = app.test_client()
    _login_as(client)

    assert client.patch("/users/7/deactivate").status_code == 403
    assert not deactivated

    account["role"] = "Admin"
    response = client.patch("/users/7/deactivate")

    assert response.status_code == 200
    assert deactivated == [7]
    assert response.get_json()["user"]["account_status"] == "Deactivated"
