from functools import wraps
from werkzeug.security import check_password_hash
from app.services.database_service import get_connection
from flask import jsonify, session

def authenticate(username, password):

    connection = get_connection()
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("""
            SELECT user_id, full_name, username, password_hash, role, account_status
            FROM users
            WHERE username = %s
        """, (username,))
        user = cursor.fetchone()
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            connection.close()

    if not user:
        return None

    if user["account_status"] != "Active":
        return None

    if not check_password_hash(
        user["password_hash"],
        password
    ):
        return None

    return user

def logout_user():
    session.clear()

    return {
        "success": True,
        "message": "Logged out successfully"
    }


def _get_account(user_id):
    connection = get_connection()
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("""
            SELECT user_id, full_name, username, role, account_status
            FROM users
            WHERE user_id = %s
        """, (user_id,))
        return cursor.fetchone()
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            connection.close()


def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user_id = session.get("user_id")
            account = _get_account(user_id) if user_id is not None else None

            if not account or account["account_status"] != "Active":
                session.clear()
                return jsonify({
                    "authenticated": False,
                    "message": "Login required"
                }), 401

            if account["role"] not in roles:
                return jsonify({
                    "success": False,
                    "message": "Not allowed"
                }), 403

            session["username"] = account["username"]
            session["full_name"] = account["full_name"]
            session["role"] = account["role"]
            return f(*args, **kwargs)
        return wrapper
    return decorator