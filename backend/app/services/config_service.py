from decimal import Decimal, InvalidOperation
from app.services.database_service import DatabaseError, db_transaction, fetch_all


def _required_text(value, field, max_length):
    if not isinstance(value, str) or not value.strip():
        raise DatabaseError(f"{field} is required.", 400)
    value = value.strip()
    if len(value) > max_length:
        raise DatabaseError(f"{field} must be {max_length} characters or fewer.", 400)
    return value


def _positive_id(value, field):
    if isinstance(value, bool) or not (
        isinstance(value, int)
        or isinstance(value, str) and value.strip().isdigit()
    ):
        raise DatabaseError(f"{field} must be a positive integer.", 400) from None
    value = int(value)
    if value < 1:
        raise DatabaseError(f"{field} must be a positive integer.", 400)
    return value


def _discount_value(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise DatabaseError("Discount value must be a non-negative number.", 400) from None

    if (
        not amount.is_finite()
        or amount < 0
        or amount > Decimal("99999999.99")
        or amount != amount.quantize(Decimal("0.01"))
    ):
        raise DatabaseError("Discount value must fit DECIMAL(10,2) and be non-negative.", 400)
    return amount


def list_categories():
    """Return all categories in display order."""
    return fetch_all("""
        SELECT category_id, category_name
        FROM categories
        ORDER BY category_name, category_id
    """)


def create_category(category_name):
    """Create a category and return its ID."""
    category_name = _required_text(category_name, "Category name", 50)
    with db_transaction() as cursor:
        cursor.execute(
            "INSERT INTO categories (category_name) VALUES (%s)",
            (category_name,),
        )
        return cursor.lastrowid


def update_category(category_id, category_name):
    """Rename a category and return its ID."""
    category_id = _positive_id(category_id, "Category ID")
    category_name = _required_text(category_name, "Category name", 50)
    with db_transaction() as cursor:
        cursor.execute("""
            SELECT category_id
            FROM categories
            WHERE category_id = %s
            FOR UPDATE
        """, (category_id,))
        if not cursor.fetchone():
            raise DatabaseError("Category not found.", 404)
        cursor.execute("""
            UPDATE categories
            SET category_name = %s
            WHERE category_id = %s
        """, (category_name, category_id))
    return category_id


def delete_category(category_id):
    """Delete an unused category; reject deletion while products reference it."""
    category_id = _positive_id(category_id, "Category ID")
    with db_transaction() as cursor:
        cursor.execute("""
            SELECT category_id
            FROM categories
            WHERE category_id = %s
            FOR UPDATE
        """, (category_id,))
        if not cursor.fetchone():
            raise DatabaseError("Category not found.", 404)

        cursor.execute("""
            SELECT COUNT(*) AS product_count
            FROM products
            WHERE category_id = %s
        """, (category_id,))
        if cursor.fetchone()["product_count"]:
            raise DatabaseError(
                "Cannot delete a category that still has products.",
                409,
            )

        cursor.execute(
            "DELETE FROM categories WHERE category_id = %s",
            (category_id,),
        )


def list_discount_types():
    """Return all discount types in display order."""
    return fetch_all("""
        SELECT discount_type_id, discount_name, discount_value
        FROM discount_types
        ORDER BY discount_name, discount_type_id
    """)


def create_discount_type(discount_name, discount_value):
    """Create a discount type and return its ID."""
    discount_name = _required_text(discount_name, "Discount name", 50)
    discount_value = _discount_value(discount_value)
    if discount_name == "Regular" and discount_value != 0:
        raise DatabaseError("The Regular discount type must have a value of 0.", 400)

    with db_transaction() as cursor:
        cursor.execute("""
            INSERT INTO discount_types (discount_name, discount_value)
            VALUES (%s, %s)
        """, (discount_name, discount_value))
        return cursor.lastrowid


def update_discount_type(discount_type_id, discount_name, discount_value):
    """Update a discount type and return its ID; database triggers protect Regular."""
    discount_type_id = _positive_id(discount_type_id, "Discount type ID")
    discount_name = _required_text(discount_name, "Discount name", 50)
    discount_value = _discount_value(discount_value)
    with db_transaction() as cursor:
        cursor.execute("""
            SELECT discount_name
            FROM discount_types
            WHERE discount_type_id = %s
            FOR UPDATE
        """, (discount_type_id,))
        existing = cursor.fetchone()
        if not existing:
            raise DatabaseError("Discount type not found.", 404)
        if existing["discount_name"] == "Regular" and (
            discount_name != "Regular" or discount_value != 0
        ):
            raise DatabaseError(
                "The Regular discount type cannot be renamed or given a value.",
                400,
            )
        if discount_name == "Regular" and discount_value != 0:
            raise DatabaseError("The Regular discount type must have a value of 0.", 400)
        cursor.execute("""
            UPDATE discount_types
            SET discount_name = %s, discount_value = %s
            WHERE discount_type_id = %s
        """, (discount_name, discount_value, discount_type_id))
    return discount_type_id


def delete_discount_type(discount_type_id):
    """Delete an unused discount type; database triggers protect Regular."""
    discount_type_id = _positive_id(discount_type_id, "Discount type ID")
    with db_transaction() as cursor:
        cursor.execute("""
            SELECT discount_name
            FROM discount_types
            WHERE discount_type_id = %s
            FOR UPDATE
        """, (discount_type_id,))
        existing = cursor.fetchone()
        if not existing:
            raise DatabaseError("Discount type not found.", 404)
        if existing["discount_name"] == "Regular":
            raise DatabaseError("The Regular discount type cannot be deleted.", 400)
        cursor.execute(
            "DELETE FROM discount_types WHERE discount_type_id = %s",
            (discount_type_id,),
        )