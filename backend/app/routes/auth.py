from flask import Blueprint, request, jsonify, session
from app.services import authenticate, logout_user, role_required

auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip() or not isinstance(password, str) or not password:
        return jsonify({
            "success": False,
            "message": "Username and password are required"
        }), 400

    user = authenticate(username.strip(), password)

    if not user:
        return jsonify({
            "success": False,
            "message": "Invalid username or password"
        }), 401

    session.clear()
    session["user_id"] = user["user_id"]
    session["username"] = user["username"]
    session["full_name"] = user["full_name"]
    session["role"] = user["role"]
    session["account_status"] = user["account_status"]

    return jsonify({
        "success": True,
        "message": "Login successful",
        "full_name": user["full_name"],
        "role": user["role"],
        "user_id": user["user_id"],
        "username": user["username"],
        "account_status": user["account_status"]
    })

@auth_bp.route("/logout", methods=["POST"])
@role_required("Cashier", "Admin")
def logout():
    result = logout_user()
    return jsonify(result)


@auth_bp.route("/me", methods=["GET"])
@role_required("Cashier", "Admin", unauthenticated_status=200)
def current_user():
    return jsonify({
        "success": True,
        "message": "Authentication successful",
        "full_name": session["full_name"],
        "role": session["role"],
        "user_id": session["user_id"],
        "username": session["username"],
        "account_status": session["account_status"],
        "authenticated": True
    })