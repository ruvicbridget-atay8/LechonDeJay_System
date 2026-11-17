from werkzeug.security import generate_password_hash
from app.services.database_service import DatabaseError, db_transaction, fetch_all


_USER_COLUMNS = """
    user_id, full_name, username, role, contact_number, account_status
"""
_ALLOWED_ROLES = {"Admin", "Cashier"}


def _required_text(value, field, max_length):
    if not isinstance(value, str) or not value.strip():
        raise DatabaseError(f"{field} is required.", 400)
    value = value.strip()
    if len(value) > max_length:
        raise DatabaseError(f"{field} must be {max_length} characters or fewer.", 400)
    return value


def _user_id(value):
    if isinstance(value, bool) or not (
        isinstance(value, int)
        or isinstance(value, str) and value.strip().isdigit()
    ):
        raise DatabaseError("User ID must be a positive integer.", 400) from None
    value = int(value)
    if value < 1:
        raise DatabaseError("User ID must be a positive integer.", 400)
    return value


def create_user(full_name, username, password, role, contact_number=None):
    """Create an active user with a hashed password; return the new user ID."""
    full_name = _required_text(full_name, "Full name", 100)
    username = _required_text(username, "Username", 50)
    if not isinstance(password, str) or not password.strip():
        raise DatabaseError("Password is required.", 400)
    if not isinstance(role, str) or role not in _ALLOWED_ROLES:
        raise DatabaseError("Role must be Admin or Cashier.", 400)

    if contact_number is not None:
        if not isinstance(contact_number, str):
            raise DatabaseError("Contact number must be text.", 400)
        contact_number = contact_number.strip() or None
        if contact_number is not None and len(contact_number) > 20:
            raise DatabaseError("Contact number must be 20 characters or fewer.", 400)

    password_hash = generate_password_hash(password)
    with db_transaction() as cursor:
        cursor.execute("""
            INSERT INTO users
                (full_name, username, password_hash, role, contact_number, account_status)
            VALUES (%s, %s, %s, %s, %s, 'Active')
        """, (full_name, username, password_hash, role, contact_number))
        return cursor.lastrowid


def deactivate_user(user_id):
    """Mark a user Deactivated; database triggers protect the last active Admin."""
    user_id = _user_id(user_id)
    with db_transaction() as cursor:
        cursor.execute("""
            SELECT user_id, account_status
            FROM users
            WHERE user_id = %s
            FOR UPDATE
        """, (user_id,))
        user = cursor.fetchone()
        if not user:
            raise DatabaseError("User not found.", 404)

        if user["account_status"] != "Deactivated":
            cursor.execute("""
                UPDATE users
                SET account_status = 'Deactivated'
                WHERE user_id = %s
            """, (user_id,))

    return {"user_id": user_id, "account_status": "Deactivated"}


def list_users(search=None):
    """List users without password hashes, optionally searching name, username, or role."""
    query = f"""
        SELECT {_USER_COLUMNS}
        FROM users
    """
    params = ()
    if search is not None:
        if not isinstance(search, str):
            raise DatabaseError("Search must be text.", 400)
        search = search.strip()
        if search:
            query += """
                WHERE full_name LIKE %s
                   OR username LIKE %s
                   OR role LIKE %s
            """
            pattern = f"%{search}%"
            params = (pattern, pattern, pattern)
    query += " ORDER BY full_name, user_id"
    return fetch_all(query, params)