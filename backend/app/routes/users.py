"""Admin endpoints for listing, creating, and deactivating user accounts."""

from flask import Blueprint, jsonify, request

from app.services import account_service
from app.services.auth_service import role_required


users_bp = Blueprint("users", __name__, url_prefix="/users")


@users_bp.route("", methods=["GET"])
@role_required("Admin")
def list_users():
    users = account_service.list_users(
        search=request.args.get("search"),
        role=request.args.get("role"),
    )
    return jsonify({"success": True, "users": users})


@users_bp.route("", methods=["POST"])
@role_required("Admin")
def create_user():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "A JSON object is required.",
        }), 400

    user_id = account_service.create_user(
        full_name=data.get("full_name"),
        username=data.get("username"),
        password=data.get("password"),
        role=data.get("role"),
        contact_number=data.get("contact_number"),
    )
    return jsonify({
        "success": True,
        "message": "Account created successfully.",
        "user_id": user_id,
    }), 201


@users_bp.route("/<int:user_id>/deactivate", methods=["PATCH"])
@role_required("Admin")
def deactivate_user(user_id):
    account = account_service.deactivate_user(user_id)
    return jsonify({
        "success": True,
        "message": "Account deactivated successfully.",
        "user": account,
    })