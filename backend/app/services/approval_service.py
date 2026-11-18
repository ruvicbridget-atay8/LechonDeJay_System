from app.services.database_service import (
    DatabaseError,
    db_transaction,
    fetch_all,
    fetch_one,
)
from app.services.inventory_service import insert_movement

ALLOWED_ACTIONS = {
    "Void": "Voided",
    "Refund": "Refunded",
}


def _validate_admin(cursor, admin_user_id):
    """Require an active Admin account."""
    cursor.execute(
        """
        SELECT user_id, role, account_status
        FROM users
        WHERE user_id = %s
        """,
        (admin_user_id,),
    )
    admin = cursor.fetchone()

    if admin is None or admin["role"] != "Admin" or admin["account_status"] != "Active":
        raise DatabaseError(
            "Only an Active Admin can approve this action.",
            403,
        )

    return admin


def approve_void_or_refund(
    transaction_id,
    admin_user_id,
    action,
    reason,
):
    """
    Approve a transaction void or refund.

    Void:
        Change status to Voided.
        Restore sold inventory using Stock In / Void Reversal.

    Refund:
        Change status to Refunded.
        Do not automatically restore inventory.

    All database changes happen in one transaction.
    """
    if action not in ALLOWED_ACTIONS:
        raise DatabaseError(
            "Action must be Void or Refund.",
            400,
        )

    if not isinstance(reason, str) or not reason.strip():
        raise DatabaseError(
            "A reason is required to void or refund.",
            400,
        )

    reason = reason.strip()

    with db_transaction() as cursor:
        _validate_admin(cursor, admin_user_id)

        cursor.execute(
            """
            SELECT
                transaction_id,
                order_number,
                status,
                total_due
            FROM transactions
            WHERE transaction_id = %s
            FOR UPDATE
            """,
            (transaction_id,),
        )
        transaction = cursor.fetchone()

        if transaction is None:
            raise DatabaseError(
                "Transaction not found.",
                404,
            )

        if transaction["status"] != "Completed":
            raise DatabaseError(
                "Only Completed transactions can be voided or refunded.",
                400,
            )

        new_status = ALLOWED_ACTIONS[action]

        cursor.execute(
            """
            UPDATE transactions
            SET
                status = %s,
                void_refund_reason = %s,
                approved_by_user_id = %s
            WHERE transaction_id = %s
            """,
            (
                new_status,
                reason,
                admin_user_id,
                transaction_id,
            ),
        )

        restored_products = []

        if action == "Void":
            cursor.execute(
                """
                SELECT
                    product_id,
                    SUM(quantity) AS total_quantity
                FROM transaction_items
                WHERE transaction_id = %s
                GROUP BY product_id
                ORDER BY product_id
                """,
                (transaction_id,),
            )
            items = cursor.fetchall()

            for item in items:
                movement_id = insert_movement(
                    cursor=cursor,
                    product_id=item["product_id"],
                    user_id=admin_user_id,
                    movement_type="Stock In",
                    quantity=item["total_quantity"],
                    reason="Void Reversal",
                )

                restored_products.append(
                    {
                        "product_id": item["product_id"],
                        "quantity": str(item["total_quantity"]),
                        "movement_id": movement_id,
                    }
                )

        result = {
            "success": True,
            "transaction_id": transaction_id,
            "order_number": transaction["order_number"],
            "status": new_status,
            "approved_by_user_id": admin_user_id,
            "reason": reason,
            "total_due": str(transaction["total_due"]),
            "inventory_restored": action == "Void",
            "restored_products": restored_products,
        }

    return result


def get_approval_history(
    admin_user_id,
    status=None,
):
    """
    Return transactions that have been voided or refunded.

    Only an Active Admin can view this history.
    """
    with db_transaction() as cursor:
        _validate_admin(cursor, admin_user_id)

        query = """
            SELECT
                t.transaction_id,
                t.order_number,
                t.date_time,
                t.status,
                t.total_due,
                t.void_refund_reason,
                t.processed_by_user_id,
                t.approved_by_user_id,
                u.full_name AS approved_by_name
            FROM transactions t
            JOIN users u
                ON u.user_id = t.approved_by_user_id
            WHERE t.status IN ('Voided', 'Refunded')
        """

        params = []

        if status is not None:
            if status not in ("Voided", "Refunded"):
                raise DatabaseError(
                    "Invalid approval history status.",
                    400,
                )

            query += " AND t.status = %s"
            params.append(status)

        query += """
            ORDER BY t.date_time DESC, t.transaction_id DESC
        """

        cursor.execute(query, tuple(params))
        results = cursor.fetchall()

    return results


def get_approval_details(
    transaction_id,
    admin_user_id,
):
    """Return details of one approved void or refund."""
    with db_transaction() as cursor:
        _validate_admin(cursor, admin_user_id)

        cursor.execute(
            """
            SELECT
                t.*,
                approver.full_name AS approved_by_name
            FROM transactions t
            LEFT JOIN users approver
                ON approver.user_id = t.approved_by_user_id
            WHERE t.transaction_id = %s
              AND t.status IN ('Voided', 'Refunded')
            """,
            (transaction_id,),
        )
        transaction = cursor.fetchone()

        if transaction is None:
            raise DatabaseError(
                "Approved void/refund transaction not found.",
                404,
            )

        cursor.execute(
            """
            SELECT
                ti.line_no,
                ti.product_id,
                p.name AS product_name,
                ti.quantity,
                ti.unit_price,
                ti.line_total,
                ti.is_addon
            FROM transaction_items ti
            JOIN products p
                ON p.product_id = ti.product_id
            WHERE ti.transaction_id = %s
            ORDER BY ti.line_no
            """,
            (transaction_id,),
        )

        transaction["items"] = cursor.fetchall()

    return transaction
