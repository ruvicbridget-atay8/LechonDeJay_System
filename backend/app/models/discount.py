import json
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional


@dataclass
class DiscountType:
    discount_name: str
    discount_value: Decimal = Decimal("0.00")
    discount_type_id: Optional[int] = None  # from the database (AUTO_INCREMENT)

    def to_dict(self):
        return {
            "discount_type_id": self.discount_type_id,
            "discount_name": self.discount_name,
            "discount_value": float(self.discount_value),  # JSON requires float/str, DB uses Decimal
        }

    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)
