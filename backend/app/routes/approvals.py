from flask import Blueprint, jsonify, request, session
from app.services import role_required
from app.services.approval_service import (
    ApprovalError,
    create_request,
    list_requests,
    decide_request,
)

approvals_bp = Blueprint("approvals", __name__)


@approvals_bp.errorhandler(ApprovalError)
def handle_approval_error(error):
    return jsonify({"success": False, "message": error.message}), error.status


def _body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApprovalError("A JSON object is required.")
    return data


@approvals_bp.post("/approvals/requests")
@role_required("Cashier")
def request_approval():
    data = _body()
    result = create_request(
        data.get("transaction_id"),
        session["user_id"],
        data.get("request_type"),
        data.get("reason"),
    )
    return jsonify({"success": True, "data": result}), 201


@approvals_bp.get("/approvals/requests")
@role_required("Admin")
def get_requests():
    return jsonify(
        {
            "success": True,
            "data": list_requests(session["user_id"], request.args.get("status")),
        }
    )


@approvals_bp.post("/approvals/requests/<int:request_id>/approve")
@role_required("Admin")
def approve(request_id):
    return jsonify(
        {
            "success": True,
            "data": decide_request(request_id, session["user_id"], "Approve"),
        }
    )


@approvals_bp.post("/approvals/requests/<int:request_id>/cancel")
@role_required("Admin")
def cancel(request_id):
    return jsonify(
        {
            "success": True,
            "data": decide_request(request_id, session["user_id"], "Cancel"),
        }
    )
