from flask import Blueprint, request, jsonify, session
from app.services.auth_service import authenticate, logout_user
from flask import session

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/api/login", methods=["POST"])
def login():

    data = request.get_json()

    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({
            "success": False,
            "message": "Username and password are required"
        }), 400

    user = authenticate(username, password)

    if not user:
        return jsonify({
            "success": False,
            "message": "Invalid username or password"
        }), 401

    session["user_id"] = user["user_id"]
    session["username"] = user["username"]
    session["role"] = user["role"]  

    return jsonify({
        "success": True,
        "user_id": user["user_id"],
        "full_name": user["full_name"],
        "role": user["role"]
    })

@auth_bp.route("/api/logout", methods=["POST"])
def logout():

    result = logout_user()

    return jsonify(result)


@auth_bp.route("/api/me", methods=["GET"])
def current_user():

    if "user_id" not in session:
        return jsonify({
            "authenticated": False
        }), 401

    return jsonify({
        "authenticated": True,
        "user_id": session["user_id"],
        "username": session["username"],
        "role": session["role"]
    })