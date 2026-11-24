from datetime import date, timedelta

from app.services.database_service import (
    DatabaseError,
    fetch_all,
    fetch_one,
)


def _validate_date_range(start_date, end_date):
    """Validate inclusive YYYY-MM-DD dates."""
    try:
        start = date.fromisoformat(str(start_date))
        end = date.fromisoformat(str(end_date))
    except (ValueError, TypeError):
        raise DatabaseError(
            "Dates must use YYYY-MM-DD.",
            400,
        )

    if end < start:
        raise DatabaseError(
            "End date cannot be before start date.",
            400,
        )

    if end == date.max:
        raise DatabaseError(
            "End date is outside the supported range.",
            400,
        )

    return start, end + timedelta(days=1)


def _require_admin(user_id):
    """Reports are restricted to Active Admin accounts."""
    user = fetch_one(
        """
        SELECT role, account_status
        FROM users
        WHERE user_id = %s
        """,
        (user_id,),
    )

    if user is None or user["role"] != "Admin" or user["account_status"] != "Active":
        raise DatabaseError(
            "Only an Active Admin can access reports.",
            403,
        )


def get_sales_summary(admin_user_id, start_date, end_date):
    """Summarize completed sales and void/refund counts."""
    _require_admin(admin_user_id)
    start, end = _validate_date_range(start_date, end_date)

    return fetch_one(
        """
        SELECT
            COUNT(*) AS total_transactions,
            COALESCE(SUM(
                CASE WHEN status = 'Completed'
                     THEN 1 ELSE 0 END
            ), 0) AS completed_transactions,
            COALESCE(SUM(
                CASE WHEN status = 'Voided'
                     THEN 1 ELSE 0 END
            ), 0) AS voided_transactions,
            COALESCE(SUM(
                CASE WHEN status = 'Refunded'
                     THEN 1 ELSE 0 END
            ), 0) AS refunded_transactions,
            COALESCE(SUM(
                CASE WHEN status = 'Completed'
                     THEN subtotal ELSE 0 END
            ), 0) AS gross_sales,
            COALESCE(SUM(
                CASE WHEN status = 'Completed'
                     THEN discount_amount ELSE 0 END
            ), 0) AS total_discounts,
            COALESCE(SUM(
                CASE WHEN status = 'Completed'
                     THEN total_due ELSE 0 END
            ), 0) AS net_sales
        FROM transactions
        WHERE date_time >= %s
          AND date_time < %s
        """,
        (start, end),
    )


def get_daily_sales(admin_user_id, start_date, end_date):
    """Return daily completed sales totals."""
    _require_admin(admin_user_id)
    start, end = _validate_date_range(start_date, end_date)

    return fetch_all(
        """
        SELECT
            DATE(date_time) AS sale_date,
            COUNT(*) AS transaction_count,
            COALESCE(SUM(subtotal), 0) AS gross_sales,
            COALESCE(SUM(discount_amount), 0) AS discounts,
            COALESCE(SUM(total_due), 0) AS net_sales
        FROM transactions
        WHERE status = 'Completed'
          AND date_time >= %s
          AND date_time < %s
        GROUP BY DATE(date_time)
        ORDER BY sale_date ASC
        """,
        (start, end),
    )


def get_product_sales_report(
    admin_user_id,
    start_date,
    end_date,
):
    """Rank products by completed sales revenue."""
    _require_admin(admin_user_id)
    start, end = _validate_date_range(start_date, end_date)

    return fetch_all(
        """
        SELECT
            p.product_id,
            p.sku,
            p.name,
            p.unit,
            COALESCE(SUM(ti.quantity), 0) AS quantity_sold,
            COALESCE(SUM(ti.line_total), 0) AS gross_revenue,
            COUNT(DISTINCT ti.transaction_id) AS order_count
        FROM transaction_items ti
        JOIN transactions t
            ON t.transaction_id = ti.transaction_id
        JOIN products p
            ON p.product_id = ti.product_id
        WHERE t.status = 'Completed'
          AND t.date_time >= %s
          AND t.date_time < %s
        GROUP BY
            p.product_id,
            p.sku,
            p.name,
            p.unit
        ORDER BY gross_revenue DESC, p.name ASC
        """,
        (start, end),
    )


def get_payment_method_report(
    admin_user_id,
    start_date,
    end_date,
):
    """Summarize completed sales by payment method."""
    _require_admin(admin_user_id)
    start, end = _validate_date_range(start_date, end_date)

    return fetch_all(
        """
        SELECT
            pm.payment_method_id,
            pm.method_name,
            COUNT(t.transaction_id) AS transaction_count,
            COALESCE(SUM(t.total_due), 0) AS total_sales
        FROM payment_methods pm
        LEFT JOIN transactions t
            ON t.payment_method_id = pm.payment_method_id
           AND t.status = 'Completed'
           AND t.date_time >= %s
           AND t.date_time < %s
        GROUP BY pm.payment_method_id, pm.method_name
        ORDER BY pm.method_name
        """,
        (start, end),
    )


def get_cashier_sales_report(
    admin_user_id,
    start_date,
    end_date,
):
    """Summarize completed transactions per cashier."""
    _require_admin(admin_user_id)
    start, end = _validate_date_range(start_date, end_date)

    return fetch_all(
        """
        SELECT
            u.user_id,
            u.full_name,
            u.role,
            COUNT(t.transaction_id) AS transaction_count,
            COALESCE(SUM(t.total_due), 0) AS net_sales
        FROM users u
        LEFT JOIN transactions t
            ON t.processed_by_user_id = u.user_id
           AND t.status = 'Completed'
           AND t.date_time >= %s
           AND t.date_time < %s
        WHERE u.role = 'Cashier'
        GROUP BY u.user_id, u.full_name, u.role
        ORDER BY net_sales DESC, u.full_name ASC
        """,
        (start, end),
    )


def get_inventory_report(admin_user_id):
    """Show current stock levels and reorder alerts."""
    _require_admin(admin_user_id)

    return fetch_all("""
        SELECT
            p.product_id,
            p.sku,
            p.name,
            c.category_name,
            p.product_type,
            p.unit,
            p.current_stock,
            p.reorder_level,
            p.status,
            CASE
                WHEN p.current_stock <= p.reorder_level
                THEN 1 ELSE 0
            END AS is_low_stock
        FROM products p
        JOIN categories c
            ON c.category_id = p.category_id
        WHERE p.status <> 'Archived'
        ORDER BY
            is_low_stock DESC,
            p.name ASC
        """)


def get_stock_movement_report(
    admin_user_id,
    start_date,
    end_date,
):
    """Summarize stock movement quantities by type."""
    _require_admin(admin_user_id)
    start, end = _validate_date_range(start_date, end_date)

    return fetch_all(
        """
        SELECT
            p.product_id,
            p.sku,
            p.name,
            p.unit,
            COALESCE(SUM(
                CASE WHEN sm.movement_type = 'Stock In'
                     THEN sm.quantity ELSE 0 END
            ), 0) AS stock_in,
            COALESCE(SUM(
                CASE WHEN sm.movement_type = 'Stock Out'
                     THEN sm.quantity ELSE 0 END
            ), 0) AS stock_out,
            COALESCE(SUM(
                CASE WHEN sm.movement_type = 'Adjustment'
                     THEN sm.quantity ELSE 0 END
            ), 0) AS net_adjustment
        FROM products p
        LEFT JOIN stock_movement sm
            ON sm.product_id = p.product_id
           AND sm.date_time >= %s
           AND sm.date_time < %s
        GROUP BY p.product_id, p.sku, p.name, p.unit
        ORDER BY p.name ASC
        """,
        (start, end),
    )


def get_shift_cash_report(
    admin_user_id,
    start_date,
    end_date,
):
    """Show opening cash, sales and cash differences."""
    _require_admin(admin_user_id)
    start, end = _validate_date_range(start_date, end_date)

    return fetch_all(
        """
        SELECT
            s.shift_id,
            s.user_id,
            s.shift_date,
            u.full_name AS cashier_name,
            (
                SELECT COUNT(t.transaction_id)
                FROM transactions t
                JOIN payment_methods pm
                    ON pm.payment_method_id = t.payment_method_id
                WHERE t.processed_by_user_id = s.user_id
                  AND t.status = 'Completed'
                  AND pm.method_name = 'Cash'
                  AND t.date_time >= s.shift_date
                  AND t.date_time < s.shift_date + INTERVAL 1 DAY
            ) AS transaction_count,
            s.opening_cash,
            s.cash_sales,
            s.expected_cash,
            s.actual_cash,
            s.cash_difference,
            CASE
                WHEN s.actual_cash IS NULL
                THEN 'Open'
                ELSE 'Closed'
            END AS shift_status
        FROM shifts s
        JOIN users u ON u.user_id = s.user_id
        WHERE s.shift_date >= %s
          AND s.shift_date < %s
        ORDER BY s.shift_date DESC, s.shift_id DESC
        """,
        (start, end),
    )


def get_void_refund_report(
    admin_user_id,
    start_date,
    end_date,
):
    """
    Show voided and refunded transactions.

    Dates refer to the original transaction date,
    not the approval date.
    """
    _require_admin(admin_user_id)
    start, end = _validate_date_range(start_date, end_date)

    return fetch_all(
        """
        SELECT
            t.transaction_id,
            t.order_number,
            t.date_time,
            t.status,
            t.total_due,
            t.void_refund_reason,
            staff.full_name AS processed_by,
            approver.full_name AS approved_by
        FROM transactions t
        JOIN users staff
            ON staff.user_id = t.processed_by_user_id
        LEFT JOIN users approver
            ON approver.user_id = t.approved_by_user_id
        WHERE t.status IN ('Voided', 'Refunded')
          AND t.date_time >= %s
          AND t.date_time < %s
        ORDER BY t.date_time DESC, t.transaction_id DESC
        """,
        (start, end),
    )
