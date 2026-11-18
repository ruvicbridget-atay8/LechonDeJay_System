from decimal import Decimal, InvalidOperation

from app.services.database_service import (
    db_transaction,
    fetch_all,
    fetch_one,
    DatabaseError,
)

MANUAL_REASONS = {
    "Stock In": {"Delivery"},
    "Stock Out": {"Spoilage", "Wastage", "Damaged", "Expired"},
    "Adjustment": {"Count Correction"},
}

ALL_REASONS = {
    **MANUAL_REASONS,
}


def quantity_decimal(value):
    """Validate a stock quantity using DECIMAL(10,2)."""
    try:
        quantity = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise DatabaseError("Quantity must be a valid number.", 400)

    if not quantity.is_finite():
        raise DatabaseError("Quantity must be a finite number.", 400)

    if quantity.as_tuple().exponent < -2:
        raise DatabaseError("Quantity can have at most 2 decimal places.", 400)

    if abs(quantity) > Decimal("99999999.99"):
        raise DatabaseError("Quantity exceeds the database limit.", 400)

    return quantity


def insert_movement(
    cursor,
    product_id,
    user_id,
    movement_type,
    quantity,
    reason,
):
    """
    Insert a stock movement within an existing database transaction.

    SQL triggers validate stock availability and update current_stock.
    This function does not commit independently.
    """
    quantity = quantity_decimal(quantity)

    cursor.execute(
        """
        INSERT INTO stock_movement (
            product_id,
            user_id,
            movement_type,
            quantity,
            reason
        )
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            product_id,
            user_id,
            movement_type,
            quantity,
            reason,
        ),
    )

    return cursor.lastrowid


def log_manual_movement(
    product_id,
    user_id,
    movement_type,
    quantity,
    reason,
):
    """
    Record manual stock movement.

    Allowed:
    - Stock In: Delivery
    - Stock Out: Spoilage, Wastage, Damaged, Expired
    - Adjustment: Count Correction

    Positive Adjustment adds stock.
    Negative Adjustment removes stock.
    """
    if movement_type not in MANUAL_REASONS:
        raise DatabaseError("Invalid movement type.", 400)

    if reason not in MANUAL_REASONS[movement_type]:
        raise DatabaseError("Invalid reason for this movement type.", 400)

    quantity = quantity_decimal(quantity)

    if movement_type == "Adjustment":
        if quantity == 0:
            raise DatabaseError("An adjustment cannot be 0.", 400)
    elif quantity <= 0:
        raise DatabaseError("Quantity must be above 0.", 400)

    with db_transaction() as cursor:
        cursor.execute(
            """
            SELECT product_id, current_stock
            FROM products
            WHERE product_id = %s
            FOR UPDATE
            """,
            (product_id,),
        )
        product = cursor.fetchone()

        if product is None:
            raise DatabaseError("Product not found.", 404)

        previous_stock = product["current_stock"]

        movement_id = insert_movement(
            cursor,
            product_id,
            user_id,
            movement_type,
            quantity,
            reason,
        )

        cursor.execute(
            """
            SELECT current_stock
            FROM products
            WHERE product_id = %s
            """,
            (product_id,),
        )
        updated_product = cursor.fetchone()

        result = {
            "success": True,
            "movement_id": movement_id,
            "product_id": product_id,
            "movement_type": movement_type,
            "quantity": str(quantity),
            "reason": reason,
            "previous_stock": str(previous_stock),
            "new_stock": str(updated_product["current_stock"]),
        }

    return result


def get_product_stock(product_id):
    """Return current inventory details for one product."""
    product = fetch_one(
        """
        SELECT
            product_id,
            sku,
            name,
            unit,
            current_stock,
            reorder_level,
            status,
            (current_stock <= reorder_level) AS is_low_stock
        FROM products
        WHERE product_id = %s
        """,
        (product_id,),
    )

    if product is None:
        raise DatabaseError("Product not found.", 404)

    return product


def get_stock_movements(
    product_id=None,
    start_date=None,
    end_date=None,
):
    """Retrieve stock movement history with optional filters."""
    query = """
        SELECT
            sm.movement_id,
            sm.product_id,
            p.name AS product_name,
            sm.user_id,
            sm.movement_type,
            sm.quantity,
            sm.reason,
            sm.date_time
        FROM stock_movement sm
        JOIN products p
            ON p.product_id = sm.product_id
        WHERE 1 = 1
    """

    params = []

    if product_id is not None:
        query += " AND sm.product_id = %s"
        params.append(product_id)

    if start_date is not None:
        query += " AND sm.date_time >= %s"
        params.append(start_date)

    if end_date is not None:
        query += " AND sm.date_time < " "DATE_ADD(%s, INTERVAL 1 DAY)"
        params.append(end_date)

    query += " ORDER BY sm.date_time DESC, sm.movement_id DESC"

    return fetch_all(query, tuple(params))


def get_low_stock_products():
    """Return products at or below their reorder level."""
    return fetch_all("""
        SELECT
            product_id,
            sku,
            name,
            unit,
            current_stock,
            reorder_level
        FROM products
        WHERE current_stock <= reorder_level
          AND status <> 'Archived'
        ORDER BY current_stock ASC, name ASC
        """)
