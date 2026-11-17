import json
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Optional


@dataclass
class PaymentMethod:
    method_name: str
    payment_method_id: Optional[int] = None  # from the database (AUTO_INCREMENT)

    def to_dict(self):
        return {
            "payment_method_id": self.payment_method_id,
            "method_name": self.method_name,
        }

    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)


@dataclass
class Transaction:
    order_number: str
    order_type: str                # Dine-in | Take-out
    amount_tendered: Decimal
    subtotal: Decimal
    total_due: Decimal
    discount_type_id: int          # FK -> DISCOUNT_TYPES
    payment_method_id: int         # FK -> PAYMENT_METHODS
    processed_by_user_id: int      # FK -> USERS (cashier)
    date_time: datetime = field(default_factory=datetime.now)
    discount_amount: Decimal = Decimal("0.00")
    status: str = "Completed"      # Completed | Voided | Refunded
    item_name: Optional[str] = None
    void_refund_reason: Optional[str] = None
    discount_id_number: Optional[str] = None   # e.g. Senior/PWD ID number
    discount_id_name: Optional[str] = None     # name on the ID
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    approved_by_user_id: Optional[int] = None  # FK -> USERS (approver)
    transaction_id: Optional[int] = None       # from the database (AUTO_INCREMENT)

    def to_dict(self):
        return {
            "transaction_id": self.transaction_id,
            "order_number": self.order_number,
            "date_time": self.date_time.isoformat(sep=" "),
            "order_type": self.order_type,
            "item_name": self.item_name,
            "amount_tendered": float(self.amount_tendered),  # JSON requires float/str, DB uses Decimal
            "subtotal": float(self.subtotal),
            "discount_amount": float(self.discount_amount),
            "total_due": float(self.total_due),
            "status": self.status,
            "void_refund_reason": self.void_refund_reason,
            "discount_id_number": self.discount_id_number,
            "discount_id_name": self.discount_id_name,
            "customer_name": self.customer_name,
            "customer_contact": self.customer_contact,
            "discount_type_id": self.discount_type_id,
            "payment_method_id": self.payment_method_id,
            "processed_by_user_id": self.processed_by_user_id,
            "approved_by_user_id": self.approved_by_user_id,
            "change": float(self.amount_tendered - self.total_due),
        }

    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)


@dataclass
class TransactionItem:
    # Primary key is (transaction_id, line_no), so there is no single id column
    transaction_id: int
    line_no: int
    product_id: int
    quantity: Decimal
    unit_price: Decimal
    parent_line_no: Optional[int] = None  # set when this line is an add-on of another line
    is_addon: bool = False

    def __post_init__(self):
        if self.quantity <= 0:
            raise ValueError("quantity must be greater than 0")

    @property
    def line_total(self):
        """DERIVED: quantity x unit_price."""
        return self.quantity * self.unit_price

    def to_dict(self):
        return {
            "transaction_id": self.transaction_id,
            "line_no": self.line_no,
            "product_id": self.product_id,
            "parent_line_no": self.parent_line_no,
            "quantity": float(self.quantity),
            "unit_price": float(self.unit_price),
            "line_total": float(self.line_total),
            "is_addon": self.is_addon,
        }

    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)
