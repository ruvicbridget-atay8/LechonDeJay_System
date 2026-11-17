from werkzeug.security import check_password_hash
from app.services.database_service import get_connection
from flask import session

def authenticate(username, password):

    connection = get_connection()

    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT *
        FROM users
        WHERE username = %s
    """, (username,))

    user = cursor.fetchone()

    cursor.close()
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