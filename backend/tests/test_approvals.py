import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from flask import Flask

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.routes.approvals import approvals_bp
from app.services.approval_service import ApprovalError


@pytest.fixture
def client():
    app = Flask(__name__)
    app.config.update(TESTING=True, SECRET_KEY="approval-tests-only")
    app.register_blueprint(approvals_bp)
    return app.test_client()


def logged_in(client, role="Cashier", user_id=2):
    with client.session_transaction() as session:
        session["user_id"] = user_id
    return patch(
        "app.services.auth_service._get_account",
        return_value={
            "user_id": user_id,
            "username": "testuser",
            "full_name": "Test User",
            "role": role,
            "account_status": "Active",
        },
    )


@pytest.mark.parametrize("request_type", ["Void", "Refund"])
def test_cashier_submits_approval_request(client, request_type):
    payload = {
        "transaction_id": 11,
        "request_type": request_type,
        "reason": "Test request",
    }
    with logged_in(client), patch(
        "app.routes.approvals.create_request",
        return_value={"request_id": 6, "status": "Pending"},
    ) as service:
        response = client.post("/approvals/requests", json=payload)
    assert response.status_code == 201
    assert response.json == {
        "success": True,
        "data": {"request_id": 6, "status": "Pending"},
    }
    service.assert_called_once_with(11, 2, request_type, "Test request")


def test_admin_lists_pending_requests(client):
    rows = [{"request_id": 6, "status": "Pending", "request_type": "Void"}]
    with logged_in(client, "Admin", 1), patch(
        "app.routes.approvals.list_requests", return_value=rows
    ) as service:
        response = client.get("/approvals/requests?status=Pending")
    assert response.status_code == 200
    assert response.json == {"success": True, "data": rows}
    service.assert_called_once_with(1, "Pending")


@pytest.mark.parametrize("decision,endpoint,expected_status", [
    ("Approve", "approve", "Approved"),
    ("Cancel", "cancel", "Cancelled"),
])
def test_admin_reviews_request(client, decision, endpoint, expected_status):
    result = {"request_id": 6, "status": expected_status, "transaction_id": 11}
    with logged_in(client, "Admin", 1), patch(
        "app.routes.approvals.decide_request", return_value=result
    ) as service:
        response = client.post(f"/approvals/requests/6/{endpoint}")
    assert response.status_code == 200
    assert response.json == {"success": True, "data": result}
    service.assert_called_once_with(6, 1, decision)


@pytest.mark.parametrize("payload", [
    {"transaction_id": 11, "request_type": "Void"},
    {"transaction_id": 11, "request_type": "Exchange", "reason": "Test"},
    {"transaction_id": 999999, "request_type": "Void", "reason": "Test"},
])
def test_request_service_validation_errors(client, payload):
    with logged_in(client), patch(
        "app.routes.approvals.create_request",
        side_effect=ApprovalError("Invalid approval request.", 400),
    ):
        response = client.post("/approvals/requests", json=payload)
    assert response.status_code == 400
    assert response.json == {"success": False, "message": "Invalid approval request."}


def test_request_rejects_non_json_object(client):
    with logged_in(client):
        response = client.post("/approvals/requests", json=[])
    assert response.status_code == 400
    assert response.json["message"] == "A JSON object is required."


def test_cashier_cannot_use_admin_endpoints(client):
    with logged_in(client, "Cashier", 2):
        for method, url in (
            ("get", "/approvals/requests"),
            ("post", "/approvals/requests/6/approve"),
            ("post", "/approvals/requests/6/cancel"),
        ):
            response = getattr(client, method)(url)
            assert response.status_code == 403
            assert response.json["success"] is False


def test_admin_cannot_submit_cashier_request(client):
    with logged_in(client, "Admin", 1):
        response = client.post("/approvals/requests", json={
            "transaction_id": 11, "request_type": "Void", "reason": "Test"
        })
    assert response.status_code == 403
    assert response.json["success"] is False


def test_unauthenticated_users_rejected(client):
    for method, url in (
        ("post", "/approvals/requests"),
        ("get", "/approvals/requests"),
        ("post", "/approvals/requests/6/approve"),
        ("post", "/approvals/requests/6/cancel"),
    ):
        response = getattr(client, method)(url)
        assert response.status_code == 401
        assert response.json["success"] is False


def test_admin_review_nonexistent_request(client):
    with logged_in(client, "Admin", 1), patch(
        "app.routes.approvals.decide_request",
        side_effect=ApprovalError("Request not found.", 404),
    ):
        for endpoint in ("approve", "cancel"):
            response = client.post(f"/approvals/requests/999999/{endpoint}")
            assert response.status_code == 404
            assert response.json["message"] == "Request not found."


def test_admin_cannot_review_already_reviewed_request(client):
    with logged_in(client, "Admin", 1), patch(
        "app.routes.approvals.decide_request",
        side_effect=ApprovalError("Request has already been reviewed.", 409),
    ):
        for endpoint in ("approve", "cancel"):
            response = client.post(f"/approvals/requests/6/{endpoint}")
            assert response.status_code == 409
            assert response.json["message"] == "Request has already been reviewed."


def test_duplicate_pending_request_returns_conflict(client):
    with logged_in(client), patch(
        "app.routes.approvals.create_request",
        side_effect=ApprovalError("A request is already pending for this transaction.", 409),
    ):
        response = client.post("/approvals/requests", json={
            "transaction_id": 11, "request_type": "Void", "reason": "Test"
        })
    assert response.status_code == 409
    assert "already pending" in response.json["message"]
