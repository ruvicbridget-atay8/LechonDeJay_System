from contextlib import contextmanager
from decimal import Decimal

import pytest

from app.services import config_service as svc
from app.services.database_service import DatabaseError


class FakeCursor:
    def __init__(self, rows=(), lastrowid=42):
        self.rows = iter(rows)
        self.lastrowid = lastrowid
        self.queries = []

    def execute(self, query, params=None):
        self.queries.append((query, params))

    def fetchone(self):
        return next(self.rows, None)


def mock_transaction(monkeypatch, rows=()):
    cursor = FakeCursor(rows)

    @contextmanager
    def transaction():
        yield cursor

    monkeypatch.setattr(svc, "db_transaction", transaction)
    return cursor


def expect_error(expected_status, message, function, *args, **kwargs):
    with pytest.raises(DatabaseError) as exc:
        function(*args, **kwargs)
    assert exc.value.status == expected_status
    assert message in exc.value.message


@pytest.mark.parametrize("value", [None, 123, "x" * 51])
def test_required_text_invalid(value):
    expect_error(400, "Category name", svc._required_text, value, "Category name", 50)


def test_required_text_trims():
    assert svc._required_text("  Pork  ", "Category name", 50) == "Pork"


@pytest.mark.parametrize(
    "value", [None, True, 0, -2, "1.5", "abc"]
)
def test_positive_id_invalid(value):
    expect_error(400, "positive integer", svc._positive_id, value, "Category ID")


@pytest.mark.parametrize("value,expected", [(1, 1), (" 12 ", 12)])
def test_positive_id_valid(value, expected):
    assert svc._positive_id(value, "Category ID") == expected


@pytest.mark.parametrize(
    "value", [-1, "12.345", "100000000", "NaN"]
)
def test_discount_value_invalid(value):
    expect_error(400, "Discount value", svc._discount_value, value)


@pytest.mark.parametrize("value", ["0", "12.50", "99999999.99"])
def test_discount_value_valid(value):
    assert svc._discount_value(value) == Decimal(value)


def test_list_categories(monkeypatch):
    calls = []
    monkeypatch.setattr(
        svc, "fetch_all", lambda query: calls.append(query) or [{"category_id": 1}]
    )
    assert svc.list_categories() == [{"category_id": 1}]
    assert "ORDER BY category_name" in calls[0]


def test_create_category(monkeypatch):
    cursor = mock_transaction(monkeypatch)
    assert svc.create_category("  Lechon  ") == 42
    assert cursor.queries[-1][1] == ("Lechon",)


def test_update_category(monkeypatch):
    cursor = mock_transaction(monkeypatch, [{"category_id": 2}])
    assert svc.update_category(2, "Roasted") == 2
    assert "UPDATE categories" in cursor.queries[-1][0]
    assert cursor.queries[-1][1] == ("Roasted", 2)


def test_update_category_missing(monkeypatch):
    mock_transaction(monkeypatch, [None])
    expect_error(404, "Category not found", svc.update_category, 2, "Roasted")


def test_delete_category_success(monkeypatch):
    cursor = mock_transaction(monkeypatch, [{"category_id": 2}, {"product_count": 0}])
    svc.delete_category(2)
    assert "DELETE FROM categories" in cursor.queries[-1][0]
    assert cursor.queries[-1][1] == (2,)


def test_delete_category_with_products(monkeypatch):
    cursor = mock_transaction(monkeypatch, [{"category_id": 2}, {"product_count": 3}])
    expect_error(409, "still has products", svc.delete_category, 2)
    assert not any("DELETE FROM categories" in query for query, _ in cursor.queries)


def test_delete_category_missing(monkeypatch):
    mock_transaction(monkeypatch, [None])
    expect_error(404, "Category not found", svc.delete_category, 2)


def test_list_discount_types(monkeypatch):
    calls = []
    monkeypatch.setattr(
        svc, "fetch_all", lambda query: calls.append(query) or [{"discount_type_id": 1}]
    )
    assert svc.list_discount_types() == [{"discount_type_id": 1}]
    assert "ORDER BY discount_name" in calls[0]


def test_create_discount_type(monkeypatch):
    cursor = mock_transaction(monkeypatch)
    assert svc.create_discount_type("  PWD  ", "20.00") == 42
    assert cursor.queries[-1][1] == ("PWD", Decimal("20.00"))


def test_create_regular_requires_zero():
    expect_error(
        400, "must have a value of 0", svc.create_discount_type, "Regular", "1.00"
    )


def test_create_regular_zero(monkeypatch):
    cursor = mock_transaction(monkeypatch)
    assert svc.create_discount_type("Regular", "0.00") == 42
    assert cursor.queries[-1][1] == ("Regular", Decimal("0.00"))


def test_update_discount_type(monkeypatch):
    cursor = mock_transaction(monkeypatch, [{"discount_name": "PWD"}])
    assert svc.update_discount_type(3, "Senior Citizen", "20.00") == 3
    assert "UPDATE discount_types" in cursor.queries[-1][0]
    assert cursor.queries[-1][1] == ("Senior Citizen", Decimal("20.00"), 3)


def test_update_discount_missing(monkeypatch):
    mock_transaction(monkeypatch, [None])
    expect_error(
        404, "Discount type not found", svc.update_discount_type, 3, "PWD", "20"
    )


@pytest.mark.parametrize("name,value", [("Other", "0"), ("Regular", "1")])
def test_update_protected_regular(monkeypatch, name, value):
    cursor = mock_transaction(monkeypatch, [{"discount_name": "Regular"}])
    expect_error(400, "Regular discount type", svc.update_discount_type, 1, name, value)
    assert not any("UPDATE discount_types" in query for query, _ in cursor.queries)


def test_update_nonregular_to_invalid_regular(monkeypatch):
    mock_transaction(monkeypatch, [{"discount_name": "PWD"}])
    expect_error(
        400, "must have a value of 0", svc.update_discount_type, 2, "Regular", "10"
    )


def test_update_regular_zero(monkeypatch):
    cursor = mock_transaction(monkeypatch, [{"discount_name": "Regular"}])
    assert svc.update_discount_type(1, "Regular", "0") == 1
    assert "UPDATE discount_types" in cursor.queries[-1][0]


def test_delete_discount_type(monkeypatch):
    cursor = mock_transaction(monkeypatch, [{"discount_name": "PWD"}])
    svc.delete_discount_type(2)
    assert "DELETE FROM discount_types" in cursor.queries[-1][0]
    assert cursor.queries[-1][1] == (2,)


def test_delete_regular_blocked(monkeypatch):
    cursor = mock_transaction(monkeypatch, [{"discount_name": "Regular"}])
    expect_error(400, "cannot be deleted", svc.delete_discount_type, 1)
    assert not any("DELETE FROM discount_types" in query for query, _ in cursor.queries)


def test_delete_discount_missing(monkeypatch):
    mock_transaction(monkeypatch, [None])
    expect_error(404, "Discount type not found", svc.delete_discount_type, 9)
