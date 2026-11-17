from flask import Blueprint, request, jsonify, session
from app.services.auth_service import authenticate, logout_user, role_required

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

    return jsonify({
        "success": True,
        "user_id": user["user_id"],
        "full_name": user["full_name"],
        "role": user["role"]
    })

@auth_bp.route("/logout", methods=["POST"])
@role_required("Cashier", "Admin")
def logout():
    result = logout_user()
    return jsonify(result)


@auth_bp.route("/me", methods=["GET"])
@role_required("Cashier", "Admin")
def current_user():
    return jsonify({
        "authenticated": True,
        "user_id": session["user_id"],
        "username": session["username"],
        "full_name": session["full_name"],
        "role": session["role"]
    })