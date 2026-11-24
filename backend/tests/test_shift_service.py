
from contextlib import contextmanager
from datetime import date
from decimal import Decimal

import pytest

from app.services import shift_service
from app.services.database_service import DatabaseError


class FakeCursor:
    def __init__(self, rows, lastrowid=10):
        self.rows = iter(rows)
        self.lastrowid = lastrowid
        self.queries = []

    def execute(self, query, params=None):
        self.queries.append((query, params))

    def fetchone(self):
        return next(self.rows, None)


def mock_transaction(monkeypatch, rows):
    cursor = FakeCursor(rows)

    @contextmanager
    def fake_db_transaction():
        yield cursor

    monkeypatch.setattr(
        shift_service, "db_transaction", fake_db_transaction
    )
    return cursor


def assert_error(expected_status, message, function, *args, **kwargs):
    with pytest.raises(DatabaseError) as exc:
        function(*args, **kwargs)

    assert exc.value.status == expected_status
    assert message in exc.value.message

@pytest.mark.parametrize("value", [
    "-1", "100000000", "12.345", "abc"
])
def test_invalid_money(value):
    assert_error(
        400, "", shift_service._validate_money,
        value, "Opening cash"
    )


@pytest.mark.parametrize("value", ["0", "99999999.99"])
def test_valid_money(value):
    result = shift_service._validate_money(
        value, "Opening cash"
    )
    assert result == Decimal(value)


def test_invalid_date():
    assert_error(
        400, "YYYY-MM-DD",
        shift_service._validate_date, "invalid-date"
    )


def test_open_shift_success(monkeypatch):
    shift = {
        "shift_id": 10,
        "user_id": 1,
        "opening_cash": Decimal("500.00"),
    }

    cursor = mock_transaction(monkeypatch, [
        {"user_id": 1, "role": "Cashier",
         "account_status": "Active"},
        None,
        shift,
    ])

    result = shift_service.open_shift(
        1, "500.00", "2026-11-18"
    )

    assert result["success"] is True
    assert result["shift"] == shift
    assert any(
        "INSERT INTO shifts" in query
        for query, _ in cursor.queries
    )


def test_open_shift_duplicate(monkeypatch):
    mock_transaction(monkeypatch, [
        {"user_id": 1, "role": "Cashier",
         "account_status": "Active"},
        {"shift_id": 5},
    ])

    assert_error(
        409, "already exists",
        shift_service.open_shift,
        1, "500", "2026-11-18"
    )


def test_open_shift_inactive_user(monkeypatch):
    mock_transaction(monkeypatch, [
        {"user_id": 1, "role": "Cashier",
         "account_status": "Deactivated"},
    ])

    assert_error(
        403, "Active staff",
        shift_service.open_shift, 1, "500"
    )


def test_close_shift_success(monkeypatch):
    open_shift = {
        "shift_id": 10,
        "user_id": 1,
        "actual_cash": None,
    }
    closed_shift = {
        **open_shift,
        "actual_cash": Decimal("1000.00"),
    }

    cursor = mock_transaction(monkeypatch, [
        {"user_id": 1, "role": "Cashier",
         "account_status": "Active"},
        open_shift,
        closed_shift,
    ])

    result = shift_service.close_shift(
        10, 1, "1000.00"
    )

    assert result["success"] is True
    assert result["shift"]["actual_cash"] == Decimal("1000.00")
    assert any(
        "UPDATE shifts" in query
        for query, _ in cursor.queries
    )


def test_cashier_cannot_close_another_shift(monkeypatch):
    mock_transaction(monkeypatch, [
        {"user_id": 2, "role": "Cashier",
         "account_status": "Active"},
        {"shift_id": 10, "user_id": 1,
         "actual_cash": None},
    ])

    assert_error(
        403, "another cashier",
        shift_service.close_shift, 10, 2, "500"
    )


def test_admin_can_close_another_shift(monkeypatch):
    mock_transaction(monkeypatch, [
        {"user_id": 2, "role": "Admin",
         "account_status": "Active"},
        {"shift_id": 10, "user_id": 1,
         "actual_cash": None},
        {"shift_id": 10, "user_id": 1,
         "actual_cash": Decimal("500.00")},
    ])

    result = shift_service.close_shift(10, 2, "500")
    assert result["success"] is True


def test_close_already_closed_shift(monkeypatch):
    mock_transaction(monkeypatch, [
        {"user_id": 1, "role": "Cashier",
         "account_status": "Active"},
        {"shift_id": 10, "user_id": 1,
         "actual_cash": Decimal("500.00")},
    ])

    assert_error(
        400, "already closed",
        shift_service.close_shift, 10, 1, "500"
    )


def test_close_missing_shift(monkeypatch):
    mock_transaction(monkeypatch, [
        {"user_id": 1, "role": "Cashier",
         "account_status": "Active"},
        None,
    ])

    assert_error(
        404, "Shift not found",
        shift_service.close_shift, 999, 1, "500"
    )


def test_list_shifts_cashier_filter(monkeypatch):
    calls = []

    def fake_fetch_one(query, params):
        return {"role": "Cashier",
                "account_status": "Active"}

    def fake_fetch_all(query, params):
        calls.append((query, params))
        return [{"shift_id": 10, "user_id": 1, "sales_count": 1}]

    monkeypatch.setattr(
        shift_service, "fetch_one", fake_fetch_one
    )
    monkeypatch.setattr(
        shift_service, "fetch_all", fake_fetch_all
    )

    result = shift_service.list_shifts(
        1,
        start_date="2026-11-01",
        end_date="2026-11-18",
        status="Open",
    )

    assert len(result) == 1
    assert result[0]["sales_count"] == 1
    query, params = calls[0]
    assert "AS sales_count" in query
    assert "COUNT(t.transaction_id)" in query
    assert "t.status = 'Completed'" in query
    assert "pm.method_name = 'Cash'" in query
    assert "t.date_time < s.shift_date + INTERVAL 1 DAY" in query
    assert "s.user_id = %s" in query
    assert "s.actual_cash IS NULL" in query
    assert params == (
        1, date(2026, 11, 1), date(2026, 11, 18)
    )


def test_list_shifts_invalid_status(monkeypatch):
    monkeypatch.setattr(
        shift_service, "fetch_one",
        lambda query, params: {
            "role": "Admin",
            "account_status": "Active",
        },
    )

    assert_error(
        400, "Open or Closed",
        shift_service.list_shifts,
        1, status="Pending"
    )


def test_get_shift_restricts_cashier(monkeypatch):
    calls = []

    def fake_fetch_one(query, params):
        calls.append((query, params))
        if len(calls) == 1:
            return {
                "role": "Cashier",
                "account_status": "Active",
            }
        return None

    monkeypatch.setattr(
        shift_service, "fetch_one", fake_fetch_one
    )

    assert_error(
        404, "access denied",
        shift_service.get_shift, 10, 2
    )

    assert "AS sales_count" in calls[1][0]
    assert "COUNT(t.transaction_id)" in calls[1][0]
    assert "s.user_id = %s" in calls[1][0]
    assert calls[1][1] == (10, 2)


def test_get_open_shift(monkeypatch):
    calls = []

    def fake_fetch_one(query, params):
        calls.append((query, params))
        return {
            "shift_id": 10,
            "user_id": 1,
            "actual_cash": None,
            "sales_count": 0,
        }
    monkeypatch.setattr(shift_service, "fetch_one", fake_fetch_one)

    result = shift_service.get_open_shift(1)
    assert result["shift_id"] == 10
    assert result["sales_count"] == 0
    assert "AS sales_count" in calls[0][0]
    assert "COUNT(t.transaction_id)" in calls[0][0]
    assert "pm.method_name = 'Cash'" in calls[0][0]
