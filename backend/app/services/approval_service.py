from app.services.database_service import DatabaseError, get_connection


class ApprovalError(DatabaseError):
    def __init__(self, message, status=400):
        super().__init__(message, status)


def _connection_call(callback):
    conn = get_connection()
    cursor = None
    try:
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)
        result = callback(cursor)
        conn.commit()
        return result
    except Exception:
        conn.rollback()
        raise
    finally:
        if cursor is not None:
            cursor.close()
        conn.close()


def _require_active(cursor, user_id, role=None):
    cursor.execute(
        "SELECT role, account_status FROM users WHERE user_id=%s", (user_id,)
    )
    user = cursor.fetchone()
    if (
        not user
        or user["account_status"] != "Active"
        or (role and user["role"] != role)
    ):
        raise ApprovalError("Active authorized user required.", 403)


def _validate_request_fields(request_type, reason):
    if request_type not in ("Void", "Refund"):
        raise ApprovalError("request_type must be Void or Refund.")
    if not isinstance(reason, str) or not reason.strip() or len(reason.strip()) > 255:
        raise ApprovalError("A reason of 1-255 characters is required.")
    return reason.strip()


def create_request(transaction_id, requester_id, request_type, reason):
    reason = _validate_request_fields(request_type, reason)

    def work(c):
        _require_active(c, requester_id, "Cashier")
        c.execute(
            "SELECT status, processed_by_user_id FROM transactions WHERE transaction_id=%s FOR UPDATE",
            (transaction_id,),
        )
        transaction = c.fetchone()
        if not transaction:
            raise ApprovalError("Transaction not found.", 404)
        if transaction["status"] != "Completed":
            raise ApprovalError("Only Completed transactions can be requested.", 409)
        if transaction["processed_by_user_id"] != requester_id:
            raise ApprovalError(
                "Cashier may request changes only to their own transactions.", 403
            )
        c.execute(
            "SELECT request_id FROM approval_requests WHERE transaction_id=%s AND status=%s",
            (transaction_id, "Pending"),
        )
        if c.fetchone():
            raise ApprovalError(
                "A request is already pending for this transaction.", 409
            )
        c.execute(
            "INSERT INTO approval_requests (transaction_id, requested_by_user_id, request_type, reason) VALUES (%s,%s,%s,%s)",
            (transaction_id, requester_id, request_type, reason),
        )
        return {"request_id": c.lastrowid, "status": "Pending"}

    return _connection_call(work)


def direct_void_refund(transaction_id, admin_id, request_type, reason):
    if (
        isinstance(transaction_id, bool)
        or not isinstance(transaction_id, int)
        or transaction_id <= 0
    ):
        raise ApprovalError("transaction_id must be a positive integer.")
    reason = _validate_request_fields(request_type, reason)

    def work(c):
        _require_active(c, admin_id, "Admin")
        c.execute(
            "SELECT status FROM transactions WHERE transaction_id=%s FOR UPDATE",
            (transaction_id,),
        )
        transaction = c.fetchone()
        if not transaction:
            raise ApprovalError("Transaction not found.", 404)
        if transaction["status"] != "Completed":
            raise ApprovalError(
                "Only Completed transactions can be voided or refunded.", 409
            )

        c.execute(
            "SELECT request_id FROM approval_requests WHERE transaction_id=%s AND status=%s",
            (transaction_id, "Pending"),
        )
        if c.fetchone():
            raise ApprovalError(
                "A request is already pending for this transaction.", 409
            )

        c.execute(
            "INSERT INTO approval_requests (transaction_id, requested_by_user_id, request_type, reason) VALUES (%s,%s,%s,%s)",
            (transaction_id, admin_id, request_type, reason),
        )
        request_id = c.lastrowid
        decision = _apply_decision(c, request_id, admin_id, "Approve")
        transaction_status = "Voided" if request_type == "Void" else "Refunded"

        return {
            "message": f"Transaction {transaction_status.lower()} successfully.",
            "request": {
                "request_id": request_id,
                "transaction_id": transaction_id,
                "requested_by_user_id": admin_id,
                "request_type": request_type,
                "reason": reason,
                "status": decision["status"],
                "reviewed_by_user_id": admin_id,
            },
            "transaction": {
                "transaction_id": transaction_id,
                "status": transaction_status,
            },
        }

    return _connection_call(work)


def list_requests(admin_id, status=None):
    if status is not None and status not in ("Pending", "Approved", "Cancelled"):
        raise ApprovalError("Invalid status filter.")

    def work(c):
        _require_active(c, admin_id, "Admin")
        sql = "SELECT request_id, transaction_id, requested_by_user_id, request_type, reason, status, reviewed_by_user_id, requested_at, reviewed_at FROM approval_requests"
        if status:
            sql += " WHERE status=%s"
        sql += " ORDER BY requested_at DESC, request_id DESC"
        c.execute(sql, (status,) if status else ())
        return c.fetchall()

    return _connection_call(work)


def _apply_decision(c, request_id, admin_id, decision):
    _require_active(c, admin_id, "Admin")
    c.execute(
        "SELECT * FROM approval_requests WHERE request_id=%s FOR UPDATE",
        (request_id,),
    )
    req = c.fetchone()
    if not req:
        raise ApprovalError("Request not found.", 404)
    if req["status"] != "Pending":
        raise ApprovalError("Request has already been reviewed.", 409)
    c.execute(
        "SELECT status FROM transactions WHERE transaction_id=%s FOR UPDATE",
        (req["transaction_id"],),
    )
    transaction = c.fetchone()
    if not transaction or transaction["status"] != "Completed":
        raise ApprovalError("Transaction is no longer Completed.", 409)
    if decision == "Approve":
        new_status = "Voided" if req["request_type"] == "Void" else "Refunded"
        c.execute(
            "UPDATE transactions SET status=%s, void_refund_reason=%s, approved_by_user_id=%s WHERE transaction_id=%s",
            (new_status, req["reason"], admin_id, req["transaction_id"]),
        )
    final_status = "Approved" if decision == "Approve" else "Cancelled"
    c.execute(
        "UPDATE approval_requests SET status=%s, reviewed_by_user_id=%s, reviewed_at=NOW() WHERE request_id=%s",
        (final_status, admin_id, request_id),
    )
    return {
        "request_id": request_id,
        "status": final_status,
        "transaction_id": req["transaction_id"],
    }


def decide_request(request_id, admin_id, decision):
    if decision not in ("Approve", "Cancel"):
        raise ApprovalError("Decision must be Approve or Cancel.")

    return _connection_call(
        lambda c: _apply_decision(c, request_id, admin_id, decision)
    )
