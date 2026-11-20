import re
from datetime import date, datetime
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

PRODUCT_COLUMNS = """
    p.product_id,
    p.sku,
    p.category_id,
    c.category_name,
    p.name,
    p.price,
    p.unit,
    p.current_stock,
    p.reorder_level,
    p.status,
    p.product_type,
    p.size,
    p.kilos,
    p.serving_pax,
    p.expiry_date,
    (p.current_stock <= p.reorder_level) AS is_low_stock,
    (p.expiry_date IS NOT NULL AND p.expiry_date < CURDATE()) AS is_expired
"""


def positive_id(value, field):
    if isinstance(value, bool):
        raise DatabaseError(f"{field} must be a positive integer.", 400)
    if isinstance(value, int):
        parsed = value
    elif isinstance(value, str) and value.strip().isdigit():
        parsed = int(value.strip())
    else:
        raise DatabaseError(f"{field} must be a positive integer.", 400) from None
    if parsed < 1:
        raise DatabaseError(f"{field} must be a positive integer.", 400)
    return parsed


def required_text(value, field, max_length):
    if not isinstance(value, str) or not value.strip():
        raise DatabaseError(f"{field} is required.", 400)
    value = value.strip()
    if len(value) > max_length:
        raise DatabaseError(
            f"{field} must be {max_length} characters or fewer.",
            400,
        )
    return value


def product_decimal(value, field, maximum=Decimal("99999999.99")):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise DatabaseError(f"{field} must be a valid number.", 400) from None
    if not amount.is_finite() or amount < 0:
        raise DatabaseError(f"{field} must be a non-negative number.", 400)
    if amount.as_tuple().exponent < -2:
        raise DatabaseError(f"{field} can have at most 2 decimal places.", 400)
    if amount > maximum:
        raise DatabaseError(f"{field} exceeds the database limit.", 400)
    return amount


def optional_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value)
        except ValueError:
            pass
    raise DatabaseError("Expiry date must be a valid YYYY-MM-DD date.", 400)


def normalize_product_type(value):
    if not isinstance(value, str):
        raise DatabaseError("Product type must be Finished Good or Raw Material.", 400)
    normalized = value.strip().casefold()
    if normalized == "finished good":
        return "Finished Good"
    if normalized == "raw material":
        return "Raw Material"
    raise DatabaseError("Product type must be Finished Good or Raw Material.", 400)


def product_unit(value):
    if not isinstance(value, str):
        raise DatabaseError("Unit must be piece, kilogram, or tray.", 400)
    normalized = value.strip().casefold()
    if normalized == "kg":
        normalized = "kilogram"
    if normalized not in {"piece", "kilogram", "tray"}:
        raise DatabaseError("Unit must be piece, kilogram, or tray.", 400)
    return normalized


def get_category_name(cursor, category_id):
    cursor.execute(
        "SELECT category_name FROM categories WHERE category_id = %s",
        (category_id,),
    )
    category = cursor.fetchone()
    if category is None:
        raise DatabaseError("Category not found.", 404)
    return category["category_name"]


def normalize_product(cursor, product_data, existing=None):
    if not isinstance(product_data, dict):
        raise DatabaseError("Product data must be an object.", 400)

    def value(name, default=None):
        if name in product_data:
            return product_data[name]
        if existing is not None:
            return existing.get(name, default)
        return default

    sku = required_text(value("sku"), "SKU", 30).upper()
    if re.fullmatch(r"[A-Z0-9-]+", sku) is None:
        raise DatabaseError("SKU may contain only letters, numbers, and hyphens.", 400)
    name = required_text(value("name"), "Product name", 100)
    category_id = positive_id(value("category_id"), "Category ID")
    category_name = get_category_name(cursor, category_id)
    product_type = normalize_product_type(value("product_type"))
    unit = product_unit(value("unit"))
    price = product_decimal(value("price"), "Price")
    current_stock = product_decimal(
        value("current_stock", Decimal("0.00")),
        "Current stock",
    )
    reorder_level = product_decimal(value("reorder_level"), "Reorder level")

    status = value(
        "status",
        "Available" if current_stock > 0 else "Unavailable",
    )
    if not isinstance(status, str) or status.strip() not in {
        "Available",
        "Unavailable",
        "Archived",
    }:
        raise DatabaseError("Status must be Available, Unavailable, or Archived.", 400)
    status = status.strip()
    if existing is None and status == "Archived":
        raise DatabaseError("A new product cannot be archived.", 400)

    size = value("size")
    kilos = value("kilos")
    serving_pax = value("serving_pax")
    if category_name == "Whole Lechon":
        size = required_text(size, "Size", 30)
        kilos = product_decimal(
            kilos,
            "Kilos",
            maximum=Decimal("9999.99"),
        )
        serving_pax = positive_id(serving_pax, "Serving pax")
    else:
        if size not in (None, "") or kilos not in (None, "") or serving_pax not in (None, ""):
            raise DatabaseError(
                "Size, kilos and serving pax are only for Whole Lechon.",
                400,
            )
        size = None
        kilos = None
        serving_pax = None

    if (
        (category_name == "Raw Materials" and product_type != "Raw Material")
        or (category_name != "Raw Materials" and product_type == "Raw Material")
    ):
        raise DatabaseError(
            "Raw Materials category and Raw Material type must match.",
            400,
        )

    if existing is not None and sku != existing["sku"]:
        raise DatabaseError("Product SKU cannot be changed.", 400)

    return {
        "sku": sku,
        "name": name,
        "category_id": category_id,
        "price": price,
        "unit": unit,
        "product_type": product_type,
        "current_stock": current_stock,
        "reorder_level": reorder_level,
        "status": status,
        "size": size,
        "kilos": kilos,
        "serving_pax": serving_pax,
        "expiry_date": optional_date(value("expiry_date")),
    }


def record_management(cursor, user_id, product_id, action_type):
    cursor.execute(
        """
        INSERT INTO manages (user_id, product_id, action_type)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE
            last_modified = CURRENT_TIMESTAMP,
            action_type = %s
        """,
        (user_id, product_id, action_type, action_type),
    )


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
    if not isinstance(movement_type, str) or movement_type not in MANUAL_REASONS:
        raise DatabaseError("Invalid movement type.", 400)

    if not isinstance(reason, str) or reason not in MANUAL_REASONS[movement_type]:
        raise DatabaseError("Invalid reason for this movement type.", 400)

    product_id = positive_id(product_id, "Product ID")
    user_id = positive_id(user_id, "User ID")
    quantity = quantity_decimal(quantity)

    if movement_type == "Adjustment":
        if quantity == 0:
            raise DatabaseError("An adjustment cannot be 0.", 400)
    elif quantity <= 0:
        raise DatabaseError("Quantity must be above 0.", 400)

    with db_transaction() as cursor:
        cursor.execute(
            """
            SELECT product_id, current_stock, status
            FROM products
            WHERE product_id = %s
            FOR UPDATE
            """,
            (product_id,),
        )
        product = cursor.fetchone()

        if product is None:
            raise DatabaseError("Product not found.", 404)
        if product["status"] == "Archived":
            raise DatabaseError("Archived products cannot have stock movements.", 409)

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
        expected_stock = Decimal(str(previous_stock))
        if movement_type == "Stock In" or movement_type == "Adjustment":
            expected_stock += quantity
        else:
            expected_stock -= quantity
        if updated_product is None or Decimal(str(updated_product["current_stock"])) != expected_stock:
            raise DatabaseError("The stock movement did not update current stock.", 500)

        updated_status = product["status"]
        if expected_stock == 0:
            updated_status = "Unavailable"
        elif updated_status == "Unavailable":
            updated_status = "Available"
        if updated_status != product["status"]:
            cursor.execute(
                "UPDATE products SET status = %s WHERE product_id = %s",
                (updated_status, product_id),
            )

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


def create_product(product_data, user_id):
    """Create a product and record any opening stock as a stock movement."""
    user_id = positive_id(user_id, "User ID")
    with db_transaction() as cursor:
        product = normalize_product(cursor, product_data)
        cursor.execute(
            """
            INSERT INTO products (
                sku,
                category_id,
                name,
                price,
                unit,
                reorder_level,
                status,
                product_type,
                size,
                kilos,
                serving_pax,
                expiry_date
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                product["sku"],
                product["category_id"],
                product["name"],
                product["price"],
                product["unit"],
                product["reorder_level"],
                product["status"],
                product["product_type"],
                product["size"],
                product["kilos"],
                product["serving_pax"],
                product["expiry_date"],
            ),
        )
        product_id = cursor.lastrowid
        record_management(cursor, user_id, product_id, "create")

        if product["current_stock"] > 0:
            insert_movement(
                cursor,
                product_id,
                user_id,
                "Stock In",
                product["current_stock"],
                "Delivery",
            )
            cursor.execute(
                "SELECT current_stock FROM products WHERE product_id = %s",
                (product_id,),
            )
            updated_product = cursor.fetchone()
            if (
                updated_product is None
                or Decimal(str(updated_product["current_stock"])) != product["current_stock"]
            ):
                raise DatabaseError(
                    "The opening stock movement did not update current stock.",
                    500,
                )

    return product_id


def update_product(product_id, user_id, product_data):
    """Edit a product; stock changes are recorded as signed adjustments."""
    product_id = positive_id(product_id, "Product ID")
    user_id = positive_id(user_id, "User ID")

    with db_transaction() as cursor:
        cursor.execute(
            "SELECT * FROM products WHERE product_id = %s FOR UPDATE",
            (product_id,),
        )
        existing = cursor.fetchone()
        if existing is None:
            raise DatabaseError("Product not found.", 404)
        if existing["status"] == "Archived":
            raise DatabaseError("Archived products cannot be edited.", 409)

        product = normalize_product(cursor, product_data, existing)
        if product["status"] == "Archived":
            raise DatabaseError("Use archive_product to archive a product.", 400)
        if "status" not in product_data:
            if product["current_stock"] == 0:
                product["status"] = "Unavailable"
            elif existing["status"] == "Unavailable":
                product["status"] = "Available"

        cursor.execute(
            """
            UPDATE products
            SET category_id = %s,
                name = %s,
                price = %s,
                unit = %s,
                reorder_level = %s,
                status = %s,
                product_type = %s,
                size = %s,
                kilos = %s,
                serving_pax = %s,
                expiry_date = %s
            WHERE product_id = %s
            """,
            (
                product["category_id"],
                product["name"],
                product["price"],
                product["unit"],
                product["reorder_level"],
                product["status"],
                product["product_type"],
                product["size"],
                product["kilos"],
                product["serving_pax"],
                product["expiry_date"],
                product_id,
            ),
        )
        record_management(cursor, user_id, product_id, "update")

        stock_change = product["current_stock"] - Decimal(str(existing["current_stock"]))
        if stock_change != 0:
            insert_movement(
                cursor,
                product_id,
                user_id,
                "Adjustment",
                stock_change,
                "Count Correction",
            )
            cursor.execute(
                "SELECT current_stock FROM products WHERE product_id = %s",
                (product_id,),
            )
            updated_product = cursor.fetchone()
            if (
                updated_product is None
                or Decimal(str(updated_product["current_stock"])) != product["current_stock"]
            ):
                raise DatabaseError(
                    "The stock adjustment did not set the requested current stock.",
                    500,
                )

    return product_id


def archive_product(product_id, user_id):
    """Archive a product without deleting its stock or historical records."""
    product_id = positive_id(product_id, "Product ID")
    user_id = positive_id(user_id, "User ID")
    with db_transaction() as cursor:
        cursor.execute(
            "SELECT status FROM products WHERE product_id = %s FOR UPDATE",
            (product_id,),
        )
        product = cursor.fetchone()
        if product is None:
            raise DatabaseError("Product not found.", 404)
        if product["status"] == "Archived":
            raise DatabaseError("Product is already archived.", 409)

        cursor.execute(
            "UPDATE products SET status = 'Archived' WHERE product_id = %s",
            (product_id,),
        )
        record_management(cursor, user_id, product_id, "archive")

    return {"product_id": product_id, "status": "Archived"}


def search_products(search_term=None):
    """Search products by SKU, name, or category, including archived items."""
    query = f"""
        SELECT {PRODUCT_COLUMNS}
        FROM products p
        JOIN categories c ON c.category_id = p.category_id
    """
    params = ()
    if search_term is not None and str(search_term).strip():
        term = f"%{str(search_term).strip()}%"
        query += """
            WHERE p.sku LIKE %s
               OR p.name LIKE %s
               OR c.category_name LIKE %s
        """
        params = (term, term, term)
    query += " ORDER BY p.name, p.product_id"
    return fetch_all(query, params)


def get_product_by_sku(sku):
    """Return one product and its stock/expiry flags by SKU."""
    sku = required_text(sku, "SKU", 30).upper()
    product = fetch_one(
        f"""
        SELECT {PRODUCT_COLUMNS}
        FROM products p
        JOIN categories c ON c.category_id = p.category_id
        WHERE p.sku = %s
        """,
        (sku,),
    )
    if product is None:
        raise DatabaseError("Product not found.", 404)
    return product


def get_catalog():
    """Return only products marked Available and typed as Finished Good."""
    return fetch_all(f"""
        SELECT {PRODUCT_COLUMNS}
        FROM products p
        JOIN categories c ON c.category_id = p.category_id
        WHERE p.status = 'Available'
          AND p.product_type = 'Finished Good'
        ORDER BY p.name, p.product_id
    """)


def get_product_stock(product_id):
    """Return current inventory details for one product."""
    product_id = positive_id(product_id, "Product ID")
    product = fetch_one(
        f"""
        SELECT {PRODUCT_COLUMNS}
        FROM products p
        JOIN categories c ON c.category_id = p.category_id
        WHERE p.product_id = %s
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
    sku=None,
    movement_type=None,
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

    if sku is not None:
        query += " AND p.sku = %s"
        params.append(required_text(sku, "SKU", 30).upper())

    if movement_type is not None:
        if movement_type not in {"Stock In", "Stock Out", "Adjustment"}:
            raise DatabaseError("Invalid movement type.", 400)
        query += " AND sm.movement_type = %s"
        params.append(movement_type)

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
    return fetch_all(f"""
        SELECT {PRODUCT_COLUMNS}
        FROM products p
        JOIN categories c ON c.category_id = p.category_id
        WHERE p.current_stock <= p.reorder_level
          AND p.status <> 'Archived'
        ORDER BY p.current_stock ASC, p.name ASC
    """)


def get_expired_products():
    """Return non-archived products whose expiry date is before today."""
    return fetch_all(f"""
        SELECT {PRODUCT_COLUMNS}
        FROM products p
        JOIN categories c ON c.category_id = p.category_id
        WHERE p.expiry_date < CURDATE()
          AND p.status <> 'Archived'
        ORDER BY p.expiry_date ASC, p.name ASC
    """)
