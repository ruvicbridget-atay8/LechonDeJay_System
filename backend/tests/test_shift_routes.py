import sys
from pathlib import Path
from unittest.mock import patch

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.routes.shifts import shifts_bp
from app.services.database_service import DatabaseError


@pytest.fixture
def app():
    from flask import Flask, jsonify

    application = Flask(__name__)
    application.config.update(TESTING=True, SECRET_KEY="test-only-secret")
    application.register_blueprint(shifts_bp)

    @application.errorhandler(DatabaseError)
    def database_error(exc):
        return jsonify(success=False, message=exc.message), exc.status

    return application


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, user_id=1, role="Cashier"):
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
    return patch(
        "app.services.auth_service._get_account",
        return_value={
            "user_id": user_id, "username": "tester", "full_name": "Test User",
            "role": role, "account_status": "Active",
        },
    )


def test_open_shift_success(client):
    with login(client), patch("app.routes.shifts.shift_service.open_shift", return_value={"shift_id": 7}) as service:
        response = client.post("/shifts/open", json={"opening_cash": 1000})
    assert response.status_code == 201
    assert response.json == {"success": True, "data": {"shift_id": 7}}
    service.assert_called_once_with(user_id=1, opening_cash=1000)


@pytest.mark.parametrize("body,message", [
    ({}, "Opening cash is required."),
    ([], "A JSON object is required."),
])
def test_open_shift_invalid_body(client, body, message):
    with login(client):
        response = client.post("/shifts/open", json=body)
    assert response.status_code == 400
    assert response.json["message"] == message


def test_open_shift_service_validation_error(client):
    with login(client), patch("app.routes.shifts.shift_service.open_shift", side_effect=DatabaseError("Opening cash must be a valid number.", 400)):
        response = client.post("/shifts/open", json={"opening_cash": "abc"})
    assert response.status_code == 400
    assert response.json["message"] == "Opening cash must be a valid number."


def test_current_shift_only_returns_own_shift(client):
    shift = {"shift_id": 8, "user_id": 1, "sales_count": 2}
    with login(client, role="Admin"), patch(
        "app.routes.shifts.shift_service.get_open_shift",
        return_value=shift,
    ) as get_open_shift:
        response = client.get("/shifts/current")
    assert response.status_code == 200
    assert response.json["data"]["shift_id"] == 8
    assert response.json["data"]["sales_count"] == 2
    get_open_shift.assert_called_once_with(1)


def test_current_shift_when_none(client):
    with login(client), patch(
        "app.routes.shifts.shift_service.get_open_shift",
        return_value=None,
    ):
        response = client.get("/shifts/current")
    assert response.status_code == 200
    assert response.json["data"] is None


def test_close_shift_success_with_explicit_id(client):
    with login(client), patch("app.routes.shifts.shift_service.close_shift", return_value={"shift_id": 4, "cash_difference": 500}) as service:
        response = client.post("/shifts/close", json={"shift_id": 4, "actual_cash": 1500})
    assert response.status_code == 200
    service.assert_called_once_with(shift_id=4, user_id=1, actual_cash=1500)


def test_close_shift_resolves_own_open_shift(client):
    with login(client), patch("app.routes.shifts.shift_service.get_open_shift", return_value={"shift_id": 3}), patch("app.routes.shifts.shift_service.close_shift", return_value={"shift_id": 3}) as service:
        response = client.post("/shifts/close", json={"actual_cash": 1000})
    assert response.status_code == 200
    service.assert_called_once_with(shift_id=3, user_id=1, actual_cash=1000)


def test_close_shift_no_open_shift(client):
    with login(client), patch("app.routes.shifts.shift_service.get_open_shift", return_value=None):
        response = client.post("/shifts/close", json={"actual_cash": 1000})
    assert response.status_code == 404
    assert response.json["message"] == "No open shift found."


def test_close_shift_bad_body_or_id(client):
    with login(client):
        for body in ({}, {"actual_cash": 100, "shift_id": "4"}, {"actual_cash": 100, "shift_id": 0}, {"actual_cash": 100, "shift_id": True}):
            response = client.post("/shifts/close", json=body)
            assert response.status_code == 400


def test_list_shifts_passes_filters(client):
    shift = {"shift_id": 2, "sales_count": 1}
    with login(client), patch("app.routes.shifts.shift_service.list_shifts", return_value=[shift]) as service:
        response = client.get("/shifts?status=Closed&start_date=2026-11-01&end_date=2026-11-30")
    assert response.status_code == 200
    assert response.json["data"][0]["sales_count"] == 1
    service.assert_called_once_with(requester_user_id=1, start_date="2026-11-01", end_date="2026-11-30", status="Closed")


def test_list_shifts_service_rejects_status(client):
    with login(client), patch("app.routes.shifts.shift_service.list_shifts", side_effect=DatabaseError("Status must be Open or Closed.", 400)):
        response = client.get("/shifts?status=Pending")
    assert response.status_code == 400


def test_shifts_require_login(client):
    for url, method in (
        ("/shifts/open", "post"), ("/shifts/current", "get"),
        ("/shifts/close", "post"), ("/shifts", "get"),
    ):
        response = getattr(client, method)(url)
        assert response.status_code == 401


def test_inactive_account_denied(client):
    with client.session_transaction() as sess:
        sess["user_id"] = 1
    with patch("app.services.auth_service._get_account", return_value={"account_status": "Deactivated"}):
        response = client.get("/shifts")
    assert response.status_code == 401
