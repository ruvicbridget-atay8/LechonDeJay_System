from datetime import date
from flask import Blueprint, jsonify, request, session
from app.services import DatabaseError, role_required
from app.services import report_service

reports_bp = Blueprint("reports", __name__, url_prefix="/reports")


def respond(data):
    return jsonify({"success": True, "data": data}), 200


def date_filters():
    today = date.today().isoformat()
    return (
        request.args.get("start_date", today),
        request.args.get("end_date", today),
    )


@reports_bp.route("/sales", methods=["GET"])
@role_required("Admin")
def sales_report():
    try:
        start_date, end_date = date_filters()
        user_id = session["user_id"]

        return respond(
            {
                "summary": report_service.get_sales_summary(
                    user_id, start_date, end_date
                ),
                "daily_sales": report_service.get_daily_sales(
                    user_id, start_date, end_date
                ),
                "payment_methods": report_service.get_payment_method_report(
                    user_id, start_date, end_date
                ),
            }
        )
    except DatabaseError as exc:
        return jsonify({"success": False, "message": exc.message}), exc.status


@reports_bp.route("/product-performance", methods=["GET"])
@role_required("Admin")
def product_performance_report():
    try:
        start_date, end_date = date_filters()
        data = report_service.get_product_sales_report(
            session["user_id"], start_date, end_date
        )
        return respond(data)
    except DatabaseError as exc:
        return jsonify({"success": False, "message": exc.message}), exc.status


@reports_bp.route("/inventory", methods=["GET"])
@role_required("Admin")
def inventory_report():
    try:
        data = report_service.get_inventory_report(session["user_id"])
        return respond(data)
    except DatabaseError as exc:
        return jsonify({"success": False, "message": exc.message}), exc.status


@reports_bp.route("/staff-cash", methods=["GET"])
@role_required("Admin")
def staff_cash_report():
    try:
        start_date, end_date = date_filters()
        user_id = session["user_id"]

        return respond(
            {
                "cashier_sales": report_service.get_cashier_sales_report(
                    user_id, start_date, end_date
                ),
                "shift_cash": report_service.get_shift_cash_report(
                    user_id, start_date, end_date
                ),
            }
        )
    except DatabaseError as exc:
        return jsonify({"success": False, "message": exc.message}), exc.status


@reports_bp.route("/exceptions", methods=["GET"])
@role_required("Admin")
def exceptions_report():
    try:
        start_date, end_date = date_filters()
        user_id = session["user_id"]

        return respond(
            {
                "voids_refunds": report_service.get_void_refund_report(
                    user_id, start_date, end_date
                ),
                "stock_movements": report_service.get_stock_movement_report(
                    user_id, start_date, end_date
                ),
            }
        )
    except DatabaseError as exc:
        return jsonify({"success": False, "message": exc.message}), exc.status
