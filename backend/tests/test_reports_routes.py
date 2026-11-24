import sys
from pathlib import Path
from unittest.mock import patch

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.routes.reports import reports_bp
from app.services.database_service import DatabaseError


@pytest.fixture
def app():
    from flask import Flask, jsonify

    application = Flask(__name__)
    application.config.update(TESTING=True, SECRET_KEY="test-only-secret")
    application.register_blueprint(reports_bp)

    @application.errorhandler(DatabaseError)
    def database_error(exc):
        return jsonify(success=False, message=exc.message), exc.status

    return application


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, role="Admin", user_id=1):
    with client.session_transaction() as sess:
        sess["user_id"] = user_id
    return patch("app.services.auth_service._get_account", return_value={
        "user_id": user_id, "username": "tester", "full_name": "Test User",
        "role": role, "account_status": "Active",
    })


DATES = "?start_date=2026-11-01&end_date=2026-11-30"


def test_sales_report_aggregates_three_services(client):
    with login(client), patch("app.routes.reports.report_service.get_sales_summary", return_value={"net_sales": 100}) as summary, patch("app.routes.reports.report_service.get_daily_sales", return_value=[]) as daily, patch("app.routes.reports.report_service.get_payment_method_report", return_value=[]) as methods:
        response = client.get("/reports/sales" + DATES)
    assert response.status_code == 200
    assert set(response.json["data"]) == {"summary", "daily_sales", "payment_methods"}
    summary.assert_called_once_with(1, "2026-11-01", "2026-11-30")
    daily.assert_called_once_with(1, "2026-11-01", "2026-11-30")
    methods.assert_called_once_with(1, "2026-11-01", "2026-11-30")


def test_product_performance_report(client):
    with login(client), patch("app.routes.reports.report_service.get_product_sales_report", return_value=[{"product_id": 2}]) as service:
        response = client.get("/reports/product-performance" + DATES)
    assert response.status_code == 200
    assert response.json["data"] == [{"product_id": 2}]
    service.assert_called_once_with(1, "2026-11-01", "2026-11-30")


def test_inventory_report(client):
    with login(client), patch("app.routes.reports.report_service.get_inventory_report", return_value=[{"is_low_stock": 1}]) as service:
        response = client.get("/reports/inventory")
    assert response.status_code == 200
    assert response.json["data"] == [{"is_low_stock": 1}]
    service.assert_called_once_with(1)


def test_staff_cash_report(client):
    with login(client), patch("app.routes.reports.report_service.get_cashier_sales_report", return_value=[]) as cashier, patch("app.routes.reports.report_service.get_shift_cash_report", return_value=[]) as shifts:
        response = client.get("/reports/staff-cash" + DATES)
    assert response.status_code == 200
    assert set(response.json["data"]) == {"cashier_sales", "shift_cash"}
    cashier.assert_called_once_with(1, "2026-11-01", "2026-11-30")
    shifts.assert_called_once_with(1, "2026-11-01", "2026-11-30")


def test_exceptions_report(client):
    with login(client), patch("app.routes.reports.report_service.get_void_refund_report", return_value=[]) as voids, patch("app.routes.reports.report_service.get_discount_exception_report", return_value=[]) as discounts, patch("app.routes.reports.report_service.get_pending_request_report", return_value=[]) as pending, patch("app.routes.reports.report_service.get_stock_movement_report", return_value=[]) as movements:
        response = client.get("/reports/exceptions" + DATES)
    assert response.status_code == 200
    assert set(response.json["data"]) == {
        "voids_refunds", "discount_exceptions", "pending_requests",
        "stock_movements",
    }
    voids.assert_called_once_with(1, "2026-11-01", "2026-11-30")
    discounts.assert_called_once_with(1, "2026-11-01", "2026-11-30")
    pending.assert_called_once_with(1, "2026-11-01", "2026-11-30")
    movements.assert_called_once_with(1, "2026-11-01", "2026-11-30")


def test_reports_require_login(client):
    for url in (
        "/reports/sales", "/reports/product-performance", "/reports/inventory",
        "/reports/staff-cash", "/reports/exceptions",
    ):
        assert client.get(url).status_code == 401


def test_reports_are_admin_only(client):
    with login(client, role="Cashier"):
        for url in (
            "/reports/sales", "/reports/product-performance", "/reports/inventory",
            "/reports/staff-cash", "/reports/exceptions",
        ):
            response = client.get(url)
            assert response.status_code == 403
            assert response.json["message"] == "Not allowed"


@pytest.mark.parametrize("url", [
    "/reports/sales", "/reports/product-performance", "/reports/staff-cash", "/reports/exceptions",
])
def test_date_validation_errors_return_400(client, url):
    # The service is responsible for validating date strings; verify route propagation.
    service_name = {
        "/reports/sales": "get_sales_summary",
        "/reports/product-performance": "get_product_sales_report",
        "/reports/staff-cash": "get_cashier_sales_report",
        "/reports/exceptions": "get_void_refund_report",
    }[url]
    with login(client), patch("app.routes.reports.report_service." + service_name, side_effect=DatabaseError("Dates must use YYYY-MM-DD.", 400)):
        response = client.get(url + "?start_date=invalid&end_date=2026-11-30")
    assert response.status_code == 400
    assert response.json == {"success": False, "message": "Dates must use YYYY-MM-DD."}


def test_sales_defaults_to_today(client):
    with login(client), patch("app.routes.reports.report_service.get_sales_summary", return_value={}) as summary, patch("app.routes.reports.report_service.get_daily_sales", return_value=[]), patch("app.routes.reports.report_service.get_payment_method_report", return_value=[]):
        response = client.get("/reports/sales")
    assert response.status_code == 200
    args = summary.call_args.args
    assert args[0] == 1
    assert args[1] == args[2]
