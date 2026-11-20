from contextlib import contextmanager
import logging

import mysql.connector

from config import Config


class DatabaseError(Exception):
    """An error with a message that is safe to show to the user."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


_SAFE_TRIGGER_MESSAGES = frozenset({
    "A new transaction cannot have a void reason or approver.",
    "A new transaction must start as Completed.",
    "A reason is required to void or refund.",
    "Accounts cannot be deleted. Deactivate the account instead.",
    "Amount tendered is less than the total due.",
    "An add-on cannot be the parent of another add-on.",
    "An add-on line needs a parent line.",
    "An adjustment cannot be 0.",
    "An approving Admin is required to void or refund.",
    "Cannot deactivate or demote the last active Admin.",
    "Discount value cannot be negative.",
    "Enter the actual cash counted (0 or more) to close the shift.",
    "For GCash/E-Wallet and Card, amount must equal total due.",
    "Invalid subtotal or discount amount.",
    "Lines can only be added to a Completed transaction.",
    "Not enough stock for this movement.",
    "Only Available finished goods can be sold.",
    "Only add-on lines can have a parent line.",
    "Opening cash cannot be negative.",
    "Order, money, payment and staff fields cannot be changed.",
    "Parent line not found. Insert the main line first.",
    "Payment methods are fixed and cannot be deleted.",
    "Payment methods are fixed and cannot be edited.",
    "Price, stock and reorder level cannot be negative.",
    "Product not found.",
    "Products cannot be deleted. Archive the product instead.",
    "Quantity must be above 0 and unit price cannot be negative.",
    "Quantity must be above 0.",
    "Raw Materials category and Raw Material type must match.",
    "Reason and approver are only set when voiding or refunding.",
    "Senior and PWD discounts need the ID number and ID name.",
    "Shift records cannot be deleted.",
    "Shift user, date and opening cash cannot be changed.",
    "Size, kilos and serving pax are only for Whole Lechon.",
    "Stock movements cannot be deleted.",
    "Stock movements cannot be edited. Add an Adjustment instead.",
    "The Regular discount type cannot be deleted.",
    "The Regular discount type cannot be renamed or given a value.",
    "The Regular discount type must have a value of 0.",
    "The approver must be an Active Admin.",
    "The staff member must have an Active account.",
    "This adjustment would make stock negative.",
    "This shift is already closed.",
    "Total due must equal subtotal minus discount.",
    "Transaction lines cannot be deleted.",
    "Transaction lines cannot be edited after they are saved.",
    "Transactions cannot be deleted. Void or refund them instead.",
    "Voided and refunded transactions are locked.",
    "Whole Lechon needs size, kilos and serving pax.",
})


def get_connection():
    return mysql.connector.connect(
        host=Config.DB_HOST,
        port=Config.DB_PORT,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        database=Config.DB_NAME,
    )


def translate_error(err):
    """Map known MySQL errors to safe messages and status codes."""
    code = getattr(err, "errno", None)

    if code == 1644:
        message = getattr(err, "msg", None)
        if message in _SAFE_TRIGGER_MESSAGES:
            return DatabaseError(message, 400)
        return DatabaseError("The operation was rejected by a business rule.", 400)
    if code == 1062:
        message = getattr(err, "msg", "") or ""
        duplicate_key = message.rsplit(" for key ", 1)[-1].strip(" `'\"")
        if "username" in duplicate_key.lower():
            return DatabaseError(
                "Username already exists. Please choose a different username.",
                409,
            )
        return DatabaseError("That value already exists.", 409)
    if code == 1451:
        return DatabaseError("This record is still in use and cannot be removed.", 409)
    if code == 1452:
        return DatabaseError("A related record was not found.", 400)
    if code == 3819:
        return DatabaseError("That combination of values is not allowed.", 400)

    logging.getLogger(__name__).exception("Database operation failed")
    return DatabaseError("Database error. Please try again.", 500)


@contextmanager
def db_transaction():
    connection = get_connection()
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        yield cursor
        connection.commit()
    except mysql.connector.Error as err:
        connection.rollback()
        raise translate_error(err) from err
    except Exception:
        connection.rollback()
        raise
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            connection.close()


def fetch_all(sql, params=None):
    """Run a parameterized query and return all rows as dictionaries."""
    connection = get_connection()
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        return cursor.fetchall()
    except mysql.connector.Error as err:
        raise translate_error(err) from err
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            connection.close()


def fetch_one(sql, params=None):
    """Run a parameterized query and return one dictionary row or None."""
    connection = get_connection()
    cursor = None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(sql, params or ())
        return cursor.fetchone()
    except mysql.connector.Error as err:
        raise translate_error(err) from err
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            connection.close()
