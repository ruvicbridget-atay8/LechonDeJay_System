from datetime import date
from decimal import Decimal, InvalidOperation

from app.services.database_service import (
    DatabaseError,
    db_transaction,
    fetch_all,
    fetch_one,
)

MAX_MONEY = Decimal("99999999.99")


def _validate_money(value, field_name):
    """Validate a nonnegative DECIMAL(10,2) value."""
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise DatabaseError(
            f"{field_name} must be a valid number.",
            400,
        )

    if not amount.is_finite():
        raise DatabaseError(
            f"{field_name} must be a finite number.",
            400,
        )

    if amount < 0 or amount > MAX_MONEY:
        raise DatabaseError(
            f"{field_name} must be between 0 and {MAX_MONEY}.",
            400,
        )

    if amount != amount.quantize(Decimal("0.01")):
        raise DatabaseError(
            f"{field_name} can have at most 2 decimal places.",
            400,
        )

    return amount


def _validate_date(value):
    """Validate a shift date in YYYY-MM-DD format."""
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        raise DatabaseError(
            "Shift date must use YYYY-MM-DD.",
            400,
        )


def _validate_active_user(cursor, user_id):
    """Check that the staff account is active."""
    cursor.execute(
        """
        SELECT user_id, role, account_status
        FROM users
        WHERE user_id = %s
        """,
        (user_id,),
    )

    user = cursor.fetchone()

    if user is None or user["account_status"] != "Active":
        raise DatabaseError(
            "An Active staff account is required.",
            403,
        )

    return user


def open_shift(user_id, opening_cash, shift_date=None):
    """
    Open a cashier shift.

    Only one shift per user per date is allowed.
    SQL trigger initializes cash totals.
    """
    opening_cash = _validate_money(
        opening_cash,
        "Opening cash",
    )

    shift_date = _validate_date(shift_date) if shift_date is not None else date.today()

    with db_transaction() as cursor:
        user = _validate_active_user(cursor, user_id)

        if user["role"] != "Cashier":
            raise DatabaseError(
                "Only Cashiers can open cashier shifts.",
                403,
            )

        cursor.execute(
            """
            SELECT shift_id
            FROM shifts
            WHERE user_id = %s
              AND shift_date = %s
            """,
            (user_id, shift_date),
        )

        if cursor.fetchone():
            raise DatabaseError(
                "A shift already exists for this cashier and date.",
                409,
            )

        cursor.execute(
            """
            INSERT INTO shifts (
                user_id,
                shift_date,
                opening_cash
            )
            VALUES (%s, %s, %s)
            """,
            (user_id, shift_date, opening_cash),
        )

        shift_id = cursor.lastrowid

        cursor.execute(
            """
            SELECT *
            FROM shifts
            WHERE shift_id = %s
            """,
            (shift_id,),
        )

        shift = cursor.fetchone()

    return {
        "success": True,
        "message": "Shift opened successfully.",
        "shift": shift,
    }


def close_shift(shift_id, user_id, actual_cash):
    """
    Close a cashier shift.

    SQL trigger calculates:
      cash_sales
      expected_cash
      cash_difference
    """
    actual_cash = _validate_money(
        actual_cash,
        "Actual cash",
    )

    with db_transaction() as cursor:
        user = _validate_active_user(cursor, user_id)

        cursor.execute(
            """
            SELECT *
            FROM shifts
            WHERE shift_id = %s
            FOR UPDATE
            """,
            (shift_id,),
        )

        shift = cursor.fetchone()

        if shift is None:
            raise DatabaseError(
                "Shift not found.",
                404,
            )

        if user["role"] != "Admin" and shift["user_id"] != user_id:
            raise DatabaseError(
                "You cannot close another cashier's shift.",
                403,
            )

        if shift["actual_cash"] is not None:
            raise DatabaseError(
                "This shift is already closed.",
                400,
            )

        cursor.execute(
            """
            UPDATE shifts
            SET actual_cash = %s
            WHERE shift_id = %s
            """,
            (actual_cash, shift_id),
        )

        cursor.execute(
            """
            SELECT *
            FROM shifts
            WHERE shift_id = %s
            """,
            (shift_id,),
        )

        closed_shift = cursor.fetchone()

    return {
        "success": True,
        "message": "Shift closed successfully.",
        "shift": closed_shift,
    }


def get_shift(shift_id, requester_user_id):
    """Get a shift, enforcing Cashier/Admin access."""
    user = fetch_one(
        """
        SELECT role, account_status
        FROM users
        WHERE user_id = %s
        """,
        (requester_user_id,),
    )

    if not user or user["account_status"] != "Active":
        raise DatabaseError(
            "An Active account is required.",
            403,
        )

    query = """
        SELECT
            s.*,
            u.full_name AS cashier_name
        FROM shifts s
        JOIN users u ON u.user_id = s.user_id
        WHERE s.shift_id = %s
    """
    params = [shift_id]

    if user["role"] != "Admin":
        query += " AND s.user_id = %s"
        params.append(requester_user_id)

    shift = fetch_one(query, tuple(params))

    if shift is None:
        raise DatabaseError(
            "Shift not found or access denied.",
            404,
        )

    return shift


def list_shifts(
    requester_user_id,
    start_date=None,
    end_date=None,
    status=None,
):
    """List shifts with optional date and open/closed filters."""
    user = fetch_one(
        """
        SELECT role, account_status
        FROM users
        WHERE user_id = %s
        """,
        (requester_user_id,),
    )

    if not user or user["account_status"] != "Active":
        raise DatabaseError(
            "An Active account is required.",
            403,
        )

    query = """
        SELECT
            s.*,
            u.full_name AS cashier_name
        FROM shifts s
        JOIN users u ON u.user_id = s.user_id
        WHERE 1 = 1
    """
    params = []

    if user["role"] != "Admin":
        query += " AND s.user_id = %s"
        params.append(requester_user_id)

    if start_date is not None:
        query += " AND s.shift_date >= %s"
        params.append(_validate_date(start_date))

    if end_date is not None:
        query += " AND s.shift_date <= %s"
        params.append(_validate_date(end_date))

    if status is not None:
        if status == "Open":
            query += " AND s.actual_cash IS NULL"
        elif status == "Closed":
            query += " AND s.actual_cash IS NOT NULL"
        else:
            raise DatabaseError(
                "Status must be Open or Closed.",
                400,
            )

    query += " ORDER BY s.shift_date DESC, s.shift_id DESC"

    return fetch_all(query, tuple(params))


def get_open_shift(user_id):
    """Return the cashier's latest open shift, if any."""
    return fetch_one(
        """
        SELECT *
        FROM shifts
        WHERE user_id = %s
          AND actual_cash IS NULL
        ORDER BY shift_date DESC, shift_id DESC
        LIMIT 1
        """,
        (user_id,),
    )
