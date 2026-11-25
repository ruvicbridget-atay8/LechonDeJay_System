
from datetime import date, timedelta

import pytest

from app.services import report_service
from app.services.database_service import DatabaseError


def assert_error(expected_status, message, function, *args, **kwargs):
    with pytest.raises(DatabaseError) as exc:
        function(*args, **kwargs)

    assert exc.value.status == expected_status
    assert message in exc.value.message


@pytest.fixture
def mock_reports(monkeypatch):
    """Mock database calls while recording queries."""
    calls = []
    rows = [{"sample": "report data"}]

    def fake_fetch_one(query, params):
        calls.append(("one", query, params))
        if "FROM users" in query:
            return {
                "role": "Admin",
                "account_status": "Active",
            }
        return rows[0]

    def fake_fetch_all(query, params=None):
        calls.append(("all", query, params))
        return rows

    monkeypatch.setattr(report_service, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(report_service, "fetch_all", fake_fetch_all)

    return calls


def report_query(calls):
    """Return the last report query, excluding the user check."""
    return calls[-1]


def test_valid_date_range():
    start, end = report_service._validate_date_range(
        "2026-11-01", "2026-11-18"
    )

    assert start == date(2026, 11, 1)
    assert end == date(2026, 11, 19)


@pytest.mark.parametrize("start,end,message", [
    ("invalid", "2026-11-18", "YYYY-MM-DD"),
    ("2026-11-19", "2026-11-18", "before start"),
    ("2026-11-01", "9999-12-31", "supported range"),
])
def test_invalid_date_ranges(start, end, message):
    assert_error(
        400, message,
        report_service._validate_date_range,
        start, end,
    )


@pytest.mark.parametrize("account", [
    None,
    {"role": "Cashier", "account_status": "Active"},
    {"role": "Admin", "account_status": "Deactivated"},
])
def test_reports_reject_unauthorized_users(monkeypatch, account):
    monkeypatch.setattr(
        report_service,
        "fetch_one",
        lambda query, params: account,
    )

    assert_error(
        403, "Active Admin",
        report_service._require_admin, 1,
    )


def test_active_admin_allowed(monkeypatch):
    monkeypatch.setattr(
        report_service,
        "fetch_one",
        lambda query, params: {
            "role": "Admin",
            "account_status": "Active",
        },
    )

    assert report_service._require_admin(1) is None


def test_sales_summary(mock_reports):
    result = report_service.get_sales_summary(
        1, "2026-11-01", "2026-11-18"
    )

    assert result == {"sample": "report data"}

    _, query, params = report_query(mock_reports)

    assert "COUNT(*) AS total_transactions" in query
    assert "status = 'Completed'" in query
    assert "status = 'Voided'" in query
    assert "status = 'Refunded'" in query
    assert "SUM(" in query
    assert params == (date(2026, 11, 1), date(2026, 11, 19))


def test_daily_sales(mock_reports):
    result = report_service.get_daily_sales(
        1, "2026-11-01", "2026-11-18"
    )

    assert result
    _, query, params = report_query(mock_reports)

    assert "status = 'Completed'" in query
    assert "GROUP BY DATE(date_time)" in query
    assert params[1] == date(2026, 11, 19)


def test_product_sales_report(mock_reports):
    report_service.get_product_sales_report(
        1, "2026-11-01", "2026-11-18"
    )

    _, query, params = report_query(mock_reports)

    assert "JOIN transactions t" in query
    assert "JOIN products p" in query
    assert "JOIN categories c" in query
    assert "c.category_name" in query
    assert "c.category_name" in query.split("GROUP BY", 1)[1]
    assert "t.status = 'Completed'" in query
    assert "SUM(ti.quantity)" in query
    assert "gross_revenue DESC" in query
    assert len(params) == 2


def test_payment_method_report(mock_reports):
    report_service.get_payment_method_report(
        1, "2026-11-01", "2026-11-18"
    )

    _, query, params = report_query(mock_reports)

    assert "FROM payment_methods pm" in query
    assert "LEFT JOIN transactions t" in query
    assert "t.status = 'Completed'" in query
    assert "GROUP BY pm.payment_method_id" in query
    assert len(params) == 2


def test_cashier_sales_report(mock_reports):
    report_service.get_cashier_sales_report(
        1, "2026-11-01", "2026-11-18"
    )

    _, query, params = report_query(mock_reports)

    assert "u.role = 'Cashier'" in query
    assert "t.status = 'Completed'" in query
    assert "SUM(t.total_due)" in query
    assert len(params) == 2


def test_inventory_report(mock_reports):
    result = report_service.get_inventory_report(1)

    assert result
    _, query, params = report_query(mock_reports)

    assert "p.current_stock <= p.reorder_level" in query
    assert "p.status <> 'Archived'" in query
    assert "JOIN categories c" in query
    assert params is None


def test_stock_movement_report(mock_reports):
    report_service.get_stock_movement_report(
        1, "2026-11-01", "2026-11-18"
    )

    _, query, params = report_query(mock_reports)

    assert "FROM products p" in query
    assert "LEFT JOIN stock_movement sm" in query
    assert "'Stock In'" in query
    assert "'Stock Out'" in query
    assert "'Adjustment'" in query
    assert len(params) == 2


def test_shift_cash_report(mock_reports):
    report_service.get_shift_cash_report(
        1, "2026-11-01", "2026-11-18"
    )

    _, query, params = report_query(mock_reports)

    assert "FROM shifts s" in query
    assert "s.user_id" in query
    assert "AS transaction_count" in query
    assert "COUNT(t.transaction_id)" in query
    assert "t.status = 'Completed'" in query
    assert "pm.method_name = 'Cash'" in query
    assert "t.date_time < s.shift_date + INTERVAL 1 DAY" in query
    assert "s.opening_cash" in query
    assert "s.cash_sales" in query
    assert "s.expected_cash" in query
    assert "s.cash_difference" in query
    assert "THEN 'Open'" in query
    assert "ELSE 'Closed'" in query
    assert len(params) == 2


def test_void_refund_report(mock_reports):
    report_service.get_void_refund_report(
        1, "2026-11-01", "2026-11-18"
    )

    _, query, params = report_query(mock_reports)

    assert "t.status IN ('Voided', 'Refunded')" in query
    assert "t.void_refund_reason" in query
    assert "t.approved_by_user_id" in query
    assert "t.date_time >= %s" in query
    assert len(params) == 2


def test_discount_exception_report(mock_reports):
    report_service.get_discount_exception_report(
        1, "2026-11-01", "2026-11-18"
    )

    _, query, params = report_query(mock_reports)

    assert "dt.discount_name AS discount_type" in query
    assert "t.discount_amount > 0" in query
    assert "t.status = 'Completed'" in query
    assert "staff.full_name AS processed_by" in query
    assert "t.transaction_id" in query
    assert "t.order_number" in query
    assert "t.date_time" in query
    assert "dt.discount_name AS discount_type" in query
    assert "t.total_due" in query
    assert params == (date(2026, 11, 1), date(2026, 11, 19))


def test_pending_request_report_matches_transaction_or_request_date(mock_reports):
    report_service.get_pending_request_report(
        1, "2026-11-01", "2026-11-18"
    )

    _, query, params = report_query(mock_reports)

    assert "FROM approval_requests ar" in query
    assert "ar.status = 'Pending'" in query
    assert "t.date_time >= %s AND t.date_time < %s" in query
    assert "ar.requested_at >= %s AND ar.requested_at < %s" in query
    assert "requester.full_name AS requested_by" in query
    assert "ar.request_id" in query
    assert "t.transaction_id" in query
    assert "t.order_number" in query
    assert "ar.request_type" in query
    assert "ar.reason" in query
    assert "ar.requested_at" in query
    assert params == (
        date(2026, 11, 1), date(2026, 11, 19),
        date(2026, 11, 1), date(2026, 11, 19),
    )


@pytest.mark.parametrize("function_name", [
    "get_sales_summary",
    "get_void_refund_report",
])
def test_dated_reports_reject_invalid_dates(mock_reports, function_name):
    function = getattr(report_service, function_name)

    assert_error(
        400, "YYYY-MM-DD",
        function,
        1, "bad-date", "2026-11-18",
    )


def test_report_queries_restrict_access(monkeypatch):
    monkeypatch.setattr(
        report_service,
        "fetch_one",
        lambda query, params: {
            "role": "Cashier",
            "account_status": "Active",
        },
    )

    assert_error(
        403, "Active Admin",
        report_service.get_sales_summary,
        1, "2026-11-01", "2026-11-18",
    )
