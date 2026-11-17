import json
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional


@dataclass
class Shift:
    user_id: int
    opening_cash: Decimal
    expected_cash: Decimal
    shift_date: date = field(default_factory=date.today)
    cash_sales: Decimal = Decimal("0.00")
    actual_cash: Optional[Decimal] = None  # filled in at end of shift
    shift_id: Optional[int] = None         # from the database (AUTO_INCREMENT)

    @property
    def cash_difference(self):
        """DERIVED: actual_cash - expected_cash (None until actual_cash is entered)."""
        if self.actual_cash is None:
            return None
        return self.actual_cash - self.expected_cash

    def to_dict(self):
        return {
            "shift_id": self.shift_id,
            "user_id": self.user_id,
            "shift_date": self.shift_date.isoformat(),
            "opening_cash": float(self.opening_cash),  # JSON requires float/str, DB uses Decimal
            "cash_sales": float(self.cash_sales),
            "expected_cash": float(self.expected_cash),
            "actual_cash": float(self.actual_cash) if self.actual_cash is not None else None,
            "cash_difference": float(self.cash_difference) if self.cash_difference is not None else None,
        }

    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)
