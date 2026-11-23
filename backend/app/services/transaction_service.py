from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from tracemalloc import start
from uuid import uuid4

from app.services.database_service import (
    DatabaseError,
    db_transaction,
    fetch_all,
    fetch_one,
)
from app.services.inventory_service import (
    insert_movement,
    quantity_decimal,
)

CENT = Decimal("0.01")
MAX_MONEY = Decimal("99999999.99")


def money_decimal(value):
    """Validate a nonnegative DECIMAL(10,2) amount."""
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise DatabaseError("Invalid monetary amount.", 400)

    if not amount.is_finite():
        raise DatabaseError("Amount must be finite.", 400)

    if amount < 0 or amount > MAX_MONEY:
        raise DatabaseError("Amount is outside the allowed range.", 400)

    if amount != amount.quantize(CENT):
        raise DatabaseError("Amount can have at most 2 decimal places.", 400)

    return amount


def _date_range(start_date, end_date):
    """Return an inclusive date range using an exclusive end."""
    try:
        start = date.fromisoformat(str(start_date))
        end = date.fromisoformat(str(end_date))
    except (TypeError, ValueError):
        raise DatabaseError("Dates must use YYYY-MM-DD.", 400)

    if end < start:
        raise DatabaseError("End date cannot precede start date.", 400)

    if end == date.max:
        raise DatabaseError(
            "End date is outside the supported range.",
            400,
    )

    return start, end + timedelta(days=1)


def _validate_cart(cursor, cart_items):
    """
    Validate cart lines and calculate subtotal.

    Each item:
      product_id: int
      quantity: number
      is_addon: optional bool
      parent_line_no: optional int (1-based cart line number)

    Main items must appear before their add-ons.
    """
    if not isinstance(cart_items, list) or not cart_items:
        raise DatabaseError("Cart cannot be empty.", 400)

    lines = []
    subtotal = Decimal("0.00")

    for index, item in enumerate(cart_items, start=1):
        if not isinstance(item, dict):
            raise DatabaseError("Invalid cart item.", 400)

        try:
            product_id = int(item["product_id"])
            quantity = quantity_decimal(item["quantity"])
        except (KeyError, ValueError, TypeError):
            raise DatabaseError("Invalid cart product or quantity.", 400)

        if product_id <= 0 or quantity <= 0:
            raise DatabaseError("Product and quantity must be positive.", 400)

        cursor.execute(
            """
            SELECT product_id, name, price, status, product_type
            FROM products
            WHERE product_id = %s
            """,
            (product_id,),
        )
        product = cursor.fetchone()

        if not product:
            raise DatabaseError("Product not found.", 404)

        if (
            product["status"] != "Available"
            or product["product_type"] != "Finished Good"
        ):
            raise DatabaseError("Only Available finished goods can be sold.", 400)

        is_addon = item.get("is_addon", False)
        if type(is_addon) is not bool:
            raise DatabaseError("is_addon must be a boolean.", 400)

        parent_line_no = item.get("parent_line_no")

        if is_addon:
            if (
                type(parent_line_no) is not int
                or parent_line_no < 1
                or parent_line_no >= index
            ):
                raise DatabaseError("Invalid add-on parent line.", 400)

            if lines[parent_line_no - 1]["is_addon"]:
                raise DatabaseError(
                    "An add-on cannot be the parent of another add-on.", 400
                )
        elif parent_line_no is not None:
            raise DatabaseError("Only add-on lines can have a parent line.", 400)

        unit_price = Decimal(str(product["price"]))
        line_total = (quantity * unit_price).quantize(CENT, rounding=ROUND_HALF_UP)

        subtotal += line_total

        if subtotal > MAX_MONEY:
            raise DatabaseError("Subtotal exceeds database limit.", 400)

        lines.append(
            {
                "line_no": index,
                "product_id": product_id,
                "product_name": product["name"],
                "quantity": quantity,
                "unit_price": unit_price,
                "line_total": line_total,
                "is_addon": is_addon,
                "parent_line_no": parent_line_no,
            }
        )

    return lines, subtotal


def calculate_cart(cart_items):
    """Calculate a cart without creating a transaction."""
    with db_transaction() as cursor:
        lines, subtotal = _validate_cart(cursor, cart_items)

    return {
        "items": [
            {
                **line,
                "quantity": str(line["quantity"]),
                "unit_price": str(line["unit_price"]),
                "line_total": str(line["line_total"]),
            }
            for line in lines
        ],
        "subtotal": str(subtotal),
    }


def checkout(
    cart_items,
    order_type,
    discount_type_id,
    payment_method_id,
    processed_by_user_id,
    amount_tendered,
    discount_amount=0,
    discount_id_number=None,
    discount_name=None,
    customer_name=None,
    customer_contact=None,
):
    """
    Create a completed POS transaction atomically.

    SQL transaction:
      1. Insert transaction header.
      2. Insert transaction items in line order.
      3. Insert Stock Out / Sale movement for each line.

    MySQL triggers calculate line_total and update product stock.
    """
    if order_type not in ("Dine-In", "Take-Out"):
        raise DatabaseError("Invalid order type.", 400)

    discount_amount = money_decimal(discount_amount)
    amount_tendered = money_decimal(amount_tendered)

    with db_transaction() as cursor:
        lines, subtotal = _validate_cart(cursor, cart_items)

        cursor.execute(
            """
            SELECT discount_name, discount_value
            FROM discount_types
            WHERE discount_type_id = %s
            """,
            (discount_type_id,),
        )
        discount = cursor.fetchone()

        if not discount:
            raise DatabaseError("Discount type not found.", 404)

        if discount["discount_name"] == "Regular":
            if discount_amount != 0:
                raise DatabaseError("Regular transactions cannot have a discount.", 400)
        elif discount_amount > subtotal:
            raise DatabaseError("Discount cannot exceed subtotal.", 400)

        if discount["discount_name"] in ("Senior Citizen", "PWD"):
            if not discount_id_number or not discount_name:
                raise DatabaseError("Senior and PWD discounts require ID details.", 400)

        total_due = subtotal - discount_amount

        cursor.execute(
            """
            SELECT method_name
            FROM payment_methods
            WHERE payment_method_id = %s
            """,
            (payment_method_id,),
        )
        payment = cursor.fetchone()

        if not payment:
            raise DatabaseError("Payment method not found.", 404)

        if payment["method_name"] == "Cash":
            if amount_tendered < total_due:
                raise DatabaseError("Insufficient cash tendered.", 400)
            change = amount_tendered - total_due
        else:
            if amount_tendered != total_due:
                raise DatabaseError("Noncash payment must equal total due.", 400)
            change = Decimal("0.00")

        order_number = datetime.now().strftime("%y%m%d") + "-" + uuid4().hex[:6].upper()

        cursor.execute(
            """
            INSERT INTO transactions (
                order_number,
                order_type,
                item_name,
                amount,
                subtotal,
                discount_amount,
                total_due,
                status,
                discount_id_number,
                discount_name,
                customer_name,
                customer_contact,
                discount_type_id,
                payment_method_id,
                processed_by_user_id
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, 'Completed',
                %s, %s, %s, %s, %s, %s, %s
            )
            """,
            (
                order_number,
                order_type,
                lines[0]["product_name"],
                amount_tendered,
                subtotal,
                discount_amount,
                total_due,
                discount_id_number,
                discount_name,
                customer_name,
                customer_contact,
                discount_type_id,
                payment_method_id,
                processed_by_user_id,
            ),
        )

        transaction_id = cursor.lastrowid

        for line in lines:
            cursor.execute(
                """
                INSERT INTO transaction_items (
                    transaction_id,
                    line_no,
                    product_id,
                    parent_line_no,
                    quantity,
                    unit_price,
                    line_total,
                    is_addon
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    transaction_id,
                    line["line_no"],
                    line["product_id"],
                    line["parent_line_no"],
                    line["quantity"],
                    line["unit_price"],
                    line["line_total"],
                    line["is_addon"],
                ),
            )

            insert_movement(
                cursor,
                line["product_id"],
                processed_by_user_id,
                "Stock Out",
                line["quantity"],
                "Sale",
            )

    return {
        "success": True,
        "transaction_id": transaction_id,
        "order_number": order_number,
        "subtotal": str(subtotal),
        "discount_amount": str(discount_amount),
        "total_due": str(total_due),
        "amount_tendered": str(amount_tendered),
        "change": str(change),
        "status": "Completed",
    }


def get_transaction(transaction_id, requester_user_id):
    """Get one transaction and its items."""
    user = fetch_one(
        """
        SELECT role, account_status
        FROM users
        WHERE user_id = %s
        """,
        (requester_user_id,),
    )

    if not user or user["account_status"] != "Active":
        raise DatabaseError("Active account required.", 403)

    transaction = fetch_one(
        """
        SELECT *
        FROM transactions
        WHERE transaction_id = %s
        """,
        (transaction_id,),
    )

    if not transaction:
        raise DatabaseError("Transaction not found.", 404)

    if (
        user["role"] != "Admin"
        and transaction["processed_by_user_id"] != requester_user_id
    ):
        raise DatabaseError("Access denied.", 403)

    transaction["items"] = fetch_all(
        """
        SELECT ti.*, p.name AS product_name
        FROM transaction_items ti
        JOIN products p ON p.product_id = ti.product_id
        WHERE ti.transaction_id = %s
        ORDER BY ti.line_no
        """,
        (transaction_id,),
    )

    return transaction


def list_transactions(
    requester_user_id,
    start_date,
    end_date,
    status=None,
    order_type=None,
    customer_name=None,
):
    """List transactions with date, status, order type, and customer filters."""
    start, end_exclusive = _date_range(start_date, end_date)

    user = fetch_one(
        """
        SELECT role, account_status
        FROM users
        WHERE user_id = %s
        """,
        (requester_user_id,),
    )

    if not user or user["account_status"] != "Active":
        raise DatabaseError("Active account required.", 403)

    query = """
        SELECT *
        FROM transactions
        WHERE date_time >= %s
          AND date_time < %s
    """
    params = [start, end_exclusive]

    if user["role"] != "Admin":
        query += " AND processed_by_user_id = %s"
        params.append(requester_user_id)

    if status is not None:
        if status not in ("Completed", "Voided", "Refunded"):
            raise DatabaseError("Invalid transaction status.", 400)

        query += " AND status = %s"
        params.append(status)

    if order_type is not None:
        if order_type not in ("Dine-In", "Take-Out"):
            raise DatabaseError("Invalid order type.", 400)

        query += " AND order_type = %s"
        params.append(order_type)

    if customer_name is not None:
        customer_name = customer_name.strip()

        if customer_name:
            query += """
                AND (
                    customer_name LIKE %s
                    OR customer_contact LIKE %s
                )
            """
            search_value = f"%{customer_name}%"
            params.extend([search_value, search_value])

    query += " ORDER BY date_time DESC, transaction_id DESC"

    return fetch_all(query, tuple(params))


def correct_customer_details(
    transaction_id,
    admin_user_id,
    reason,
    customer_name=None,
    customer_contact=None,
    discount_id_number=None,
    discount_name=None,
):
    """
    Admin correction of customer/discount ID details.

    The current schema does not have a correction audit table.
    The reason is validated but cannot be permanently recorded.
    """
    if not isinstance(reason, str) or not reason.strip():
        raise DatabaseError("Correction reason is required.", 400)

    with db_transaction() as cursor:
        cursor.execute(
            """
            SELECT role, account_status
            FROM users
            WHERE user_id = %s
            """,
            (admin_user_id,),
        )
        admin = cursor.fetchone()

        if not admin or admin["role"] != "Admin" or admin["account_status"] != "Active":
            raise DatabaseError("Active Admin required.", 403)

        cursor.execute(
            """
            SELECT status
            FROM transactions
            WHERE transaction_id = %s
            FOR UPDATE
            """,
            (transaction_id,),
        )
        transaction = cursor.fetchone()

        if not transaction:
            raise DatabaseError("Transaction not found.", 404)

        if transaction["status"] != "Completed":
            raise DatabaseError("Only Completed transactions can be corrected.", 400)

        cursor.execute(
            """
            UPDATE transactions
            SET customer_name = %s,
                customer_contact = %s,
                discount_id_number = %s,
                discount_name = %s
            WHERE transaction_id = %s
            """,
            (
                customer_name,
                customer_contact,
                discount_id_number,
                discount_name,
                transaction_id,
            ),
        )

    return {
        "success": True,
        "transaction_id": transaction_id,
        "message": "Customer details updated.",
        "warning": (
            "Correction reason was not saved because "
            "the schema has no correction audit table."
        ),
    }


def get_receipt(transaction_id, requester_user_id):
    transaction = get_transaction(transaction_id, requester_user_id)

    payment = fetch_one(
        """
        SELECT method_name
        FROM payment_methods
        WHERE payment_method_id = %s
        """,
        (transaction["payment_method_id"],),
    )

    discount = fetch_one(
        """
        SELECT discount_name
        FROM discount_types
        WHERE discount_type_id = %s
        """,
        (transaction["discount_type_id"],),
    )

    return {
        **transaction,
        "payment_method": payment["method_name"] if payment else None,
        "discount_type": discount["discount_name"] if discount else None,
    }


def get_kitchen_ticket(transaction_id, requester_user_id):
    transaction = get_transaction(transaction_id, requester_user_id)

    items = []
    for item in transaction["items"]:
        items.append(
            {
                "line_no": item["line_no"],
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "quantity": item["quantity"],
                "parent_line_no": item["parent_line_no"],
                "is_addon": item["is_addon"],
            }
        )

    return {
        "transaction_id": transaction["transaction_id"],
        "order_number": transaction["order_number"],
        "date_time": transaction["date_time"],
        "order_type": transaction["order_type"],
        "customer_name": transaction["customer_name"],
        "items": items,
    }
