import re
from contextlib import contextmanager
from datetime import date
from decimal import Decimal

import pytest

from app.services import transaction_service as svc
from app.services.database_service import DatabaseError


class FakeCursor:
    def __init__(self, rows=(), lastrowid=77):
        self.rows = iter(rows)
        self.lastrowid = lastrowid
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchone(self):
        return next(self.rows, None)


@pytest.fixture
def transaction(monkeypatch):
    def setup(rows):
        cursor = FakeCursor(rows)

        @contextmanager
        def fake_transaction():
            yield cursor

        monkeypatch.setattr(svc, "db_transaction", fake_transaction)
        return cursor

    return setup


def product(price="100.00", status="Available", product_type="Finished Good"):
    return {
        "product_id": 1,
        "name": "Lechon",
        "price": Decimal(price),
        "status": status,
        "product_type": product_type,
    }


def checkout_args(**overrides):
    args = dict(
        cart_items=[{"product_id": 1, "quantity": 2}],
        order_type="Take-Out",
        discount_type_id=1,
        payment_method_id=1,
        processed_by_user_id=5,
        amount_tendered="250.00",
    )
    args.update(overrides)
    return args


def expect_error(expected_status, message, function, *args, **kwargs):
    with pytest.raises(DatabaseError) as exc:
        function(*args, **kwargs)

    assert exc.value.status == expected_status
    assert message in exc.value.message


@pytest.mark.parametrize(
    "value", ["-1", "100000000", "12.345", "abc"]
)
def test_invalid_money(value):
    expect_error(400, "", svc.money_decimal, value)


@pytest.mark.parametrize("value", ["0", "99999999.99"])
def test_valid_money(value):
    assert svc.money_decimal(value) == Decimal(value)


def test_date_range_rejects_max_date():
    expect_error(
        400,
        "supported range",
        svc._date_range,
        "2026-11-01",
        "9999-12-31",
    )


@pytest.mark.parametrize("start,end", [("bad", "2026-11-18")])
def test_invalid_date_range(start, end):
    expect_error(400, "", svc._date_range, start, end)


def test_cart_calculation_and_addon():
    cursor = FakeCursor([product(), product("25.00")])
    lines, subtotal = svc._validate_cart(
        cursor,
        [
            {"product_id": 1, "quantity": 2},
            {"product_id": 2, "quantity": 1, "is_addon": True, "parent_line_no": 1},
        ],
    )
    assert subtotal == Decimal("225.00")
    assert lines[1]["parent_line_no"] == 1
    assert lines[1]["line_total"] == Decimal("25.00")


def test_calculate_cart_returns_strings(transaction):
    transaction([product()])
    result = svc.calculate_cart([{"product_id": 1, "quantity": 2}])
    assert result["subtotal"] == "200.00"
    assert result["items"][0]["line_total"] == "200.00"


@pytest.mark.parametrize(
    "cart", [[], [{}], [{"product_id": 1, "quantity": 0}]]
)
def test_invalid_cart(cart):
    expect_error(400, "", svc._validate_cart, FakeCursor(), cart)


def test_missing_product():
    expect_error(
        404,
        "Product not found",
        svc._validate_cart,
        FakeCursor([None]),
        [{"product_id": 1, "quantity": 1}],
    )


@pytest.mark.parametrize(
    "status,kind", [("Unavailable", "Finished Good"), ("Available", "Raw Material")]
)
def test_unsellable_product(status, kind):
    expect_error(
        400,
        "Available finished goods",
        svc._validate_cart,
        FakeCursor([product(status=status, product_type=kind)]),
        [{"product_id": 1, "quantity": 1}],
    )


@pytest.mark.parametrize(
    "cart",
    [
        [{"product_id": 1, "quantity": 1, "is_addon": "yes"}],
        [{"product_id": 1, "quantity": 1, "is_addon": True, "parent_line_no": 1}],
        [{"product_id": 1, "quantity": 1, "parent_line_no": 1}],
    ],
)
def test_invalid_addon(cart):
    expect_error(400, "", svc._validate_cart, FakeCursor([product()]), cart)


def test_checkout_cash_and_stock_out(transaction, monkeypatch):
    cursor = transaction(
        [
            product(),
            {"discount_name": "Regular", "discount_value": Decimal("0")},
            {"method_name": "Cash"},
        ]
    )
    movements = []
    monkeypatch.setattr(svc, "insert_movement", lambda *args: movements.append(args))
    result = svc.checkout(**checkout_args())
    assert result["transaction_id"] == 77
    assert result["total_due"] == "200.00"
    assert result["change"] == "50.00"
    assert result["status"] == "Completed"
    assert re.fullmatch(r"\d{6}-[A-F0-9]{6}", result["order_number"])
    assert len(movements) == 1
    assert movements[0] == (cursor, 1, 5, "Stock Out", Decimal("2"), "Sale")
    assert any("INSERT INTO transactions" in sql for sql, _ in cursor.executed)
    assert any("INSERT INTO transaction_items" in sql for sql, _ in cursor.executed)


def test_checkout_noncash_exact_payment(transaction, monkeypatch):
    transaction(
        [
            product(),
            {"discount_name": "Regular", "discount_value": 0},
            {"method_name": "GCash"},
        ]
    )
    monkeypatch.setattr(svc, "insert_movement", lambda *args: None)
    result = svc.checkout(**checkout_args(amount_tendered="200.00"))
    assert result["change"] == "0.00"


def test_checkout_discount(transaction, monkeypatch):
    transaction(
        [
            product(),
            {"discount_name": "Promo", "discount_value": 10},
            {"method_name": "Cash"},
        ]
    )
    monkeypatch.setattr(svc, "insert_movement", lambda *args: None)
    result = svc.checkout(**checkout_args(discount_amount="20.00"))
    assert result["total_due"] == "180.00"
    assert result["change"] == "70.00"


@pytest.mark.parametrize(
    "kwargs,message",
    [
        ({"order_type": "Delivery"}, "Invalid order type"),
        ({"amount_tendered": "-1"}, "outside the allowed range"),
    ],
)
def test_checkout_prevalidation(kwargs, message):
    expect_error(400, message, svc.checkout, **checkout_args(**kwargs))


@pytest.mark.parametrize(
    "discount,payment,overrides,status,message",
    [
        (None, None, {}, 404, "Discount type not found"),
        (
            {"discount_name": "Regular"},
            None,
            {"discount_amount": "5"},
            400,
            "cannot have a discount",
        ),
        (
            {"discount_name": "Promo"},
            None,
            {"discount_amount": "201"},
            400,
            "exceed subtotal",
        ),
        ({"discount_name": "PWD"}, None, {}, 400, "require ID details"),
        ({"discount_name": "Regular"}, None, {}, 404, "Payment method not found"),
        (
            {"discount_name": "Regular"},
            {"method_name": "Cash"},
            {"amount_tendered": "100"},
            400,
            "Insufficient cash",
        ),
        (
            {"discount_name": "Regular"},
            {"method_name": "GCash"},
            {"amount_tendered": "250"},
            400,
            "Noncash payment",
        ),
    ],
)
def test_checkout_rejections(
    transaction, discount, payment, overrides, status, message
):
    rows = [product(), discount]
    if discount is not None:
        rows.append(payment)
    transaction(rows)
    expect_error(status, message, svc.checkout, **checkout_args(**overrides))


def test_get_transaction_cashier_ownership(monkeypatch):
    calls = []

    def fake_one(sql, params):
        calls.append((sql, params))
        return [
            {"role": "Cashier", "account_status": "Active"},
            {"transaction_id": 8, "processed_by_user_id": 7},
        ][len(calls) - 1]

    monkeypatch.setattr(svc, "fetch_one", fake_one)
    expect_error(403, "Access denied", svc.get_transaction, 8, 5)


def test_get_transaction_with_items(monkeypatch):
    rows = iter(
        [
            {"role": "Admin", "account_status": "Active"},
            {"transaction_id": 8, "processed_by_user_id": 7},
        ]
    )
    monkeypatch.setattr(svc, "fetch_one", lambda *args: next(rows))
    monkeypatch.setattr(svc, "fetch_all", lambda *args: [{"product_name": "Lechon"}])
    assert svc.get_transaction(8, 5)["items"][0]["product_name"] == "Lechon"


def test_list_transactions_cashier_filters(monkeypatch):
    calls = []
    monkeypatch.setattr(
        svc, "fetch_one", lambda *args: {"role": "Cashier", "account_status": "Active"}
    )

    def fake_all(sql, params):
        calls.append((sql, params))
        return []

    monkeypatch.setattr(svc, "fetch_all", fake_all)
    svc.list_transactions(
        5,
        "2026-11-01",
        "2026-11-18",
        status="Completed",
        order_type="Take-Out",
        customer_name="Jay",
    )
    sql, params = calls[0]
    assert "processed_by_user_id = %s" in sql
    assert "status = %s" in sql and "order_type = %s" in sql
    assert params == (
        date(2026, 11, 1),
        date(2026, 11, 19),
        5,
        "Completed",
        "Take-Out",
        "%Jay%",
        "%Jay%",
    )


@pytest.mark.parametrize("filters", [{"status": "Pending"}, {"order_type": "Delivery"}])
def test_list_transactions_rejects_filters(monkeypatch, filters):
    monkeypatch.setattr(
        svc, "fetch_one", lambda *args: {"role": "Admin", "account_status": "Active"}
    )
    expect_error(
        400, "Invalid", svc.list_transactions, 5, "2026-11-01", "2026-11-18", **filters
    )


def test_customer_correction_success(transaction):
    cursor = transaction(
        [{"role": "Admin", "account_status": "Active"}, {"status": "Completed"}]
    )
    result = svc.correct_customer_details(8, 5, "Typo", customer_name="Jay")
    assert result["success"] is True
    assert "not saved" in result["warning"]
    assert any("UPDATE transactions" in sql for sql, _ in cursor.executed)


@pytest.mark.parametrize(
    "rows,status,message",
    [
        ([None], 403, "Active Admin"),
        ([{"role": "Cashier", "account_status": "Active"}], 403, "Active Admin"),
        (
            [{"role": "Admin", "account_status": "Active"}, None],
            404,
            "Transaction not found",
        ),
        (
            [{"role": "Admin", "account_status": "Active"}, {"status": "Voided"}],
            400,
            "Only Completed",
        ),
    ],
)
def test_customer_correction_rejections(transaction, rows, status, message):
    transaction(rows)
    expect_error(
        status, message, svc.correct_customer_details, 8, 5, "Typo", customer_name="Jay"
    )


def test_customer_correction_requires_reason():
    expect_error(400, "Correction reason", svc.correct_customer_details, 8, 5, "")


def test_receipt(monkeypatch):
    monkeypatch.setattr(
        svc,
        "get_transaction",
        lambda *args: {"payment_method_id": 1, "discount_type_id": 2},
    )
    rows = iter([{"method_name": "Cash"}, {"discount_name": "Regular"}])
    monkeypatch.setattr(svc, "fetch_one", lambda *args: next(rows))
    receipt = svc.get_receipt(8, 5)
    assert receipt["payment_method"] == "Cash"
    assert receipt["discount_type"] == "Regular"


def test_kitchen_ticket(monkeypatch):
    monkeypatch.setattr(
        svc,
        "get_transaction",
        lambda *args: {
            "transaction_id": 8,
            "order_number": "ORD8",
            "date_time": "2026-11-18",
            "order_type": "Take-Out",
            "customer_name": "Jay",
            "items": [
                {
                    "line_no": 1,
                    "product_id": 1,
                    "product_name": "Lechon",
                    "quantity": Decimal("2"),
                    "parent_line_no": None,
                    "is_addon": False,
                    "unit_price": Decimal("100"),
                }
            ],
        },
    )
    ticket = svc.get_kitchen_ticket(8, 5)
    assert ticket["items"][0]["product_name"] == "Lechon"
    assert "unit_price" not in ticket["items"][0]
