import json
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Optional


@dataclass
class Category:
    category_name: str
    category_id: Optional[int] = None  # from the database (AUTO_INCREMENT)

    def to_dict(self):
        return {
            "category_id": self.category_id,
            "category_name": self.category_name,
        }

    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)


@dataclass
class Product:
    sku: str
    name: str
    category_id: int
    price: Decimal
    unit: str                      # piece | kg | tray
    product_type: str              # Finished Good | Raw Material
    current_stock: Decimal = Decimal("0.00")
    reorder_level: Decimal = Decimal("0.00")
    status: str = "Available"      # Available | Unavailable | Archived
    size: Optional[str] = None
    kilos: Optional[Decimal] = None
    serving_pax: Optional[int] = None
    expiry_date: Optional[date] = None
    product_id: Optional[int] = None  # from the database (AUTO_INCREMENT)

    def to_dict(self):
        return {
            "product_id": self.product_id,
            "sku": self.sku,
            "name": self.name,
            "category_id": self.category_id,
            "price": float(self.price),  # JSON requires float/str, DB uses Decimal
            "unit": self.unit,
            "current_stock": float(self.current_stock),
            "reorder_level": float(self.reorder_level),
            "status": self.status,
            "product_type": self.product_type,
            "size": self.size,
            "kilos": float(self.kilos) if self.kilos is not None else None,
            "serving_pax": self.serving_pax,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "is_low_stock": self.current_stock <= self.reorder_level,
        }

    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)


@dataclass
class StockMovement:
    product_id: int
    user_id: int
    movement_type: str             # Stock In | Stock Out | Adjustment
    quantity: Decimal
    reason: str
    date_time: datetime = field(default_factory=datetime.now)
    movement_id: Optional[int] = None  # from the database (AUTO_INCREMENT)

    def to_dict(self):
        return {
            "movement_id": self.movement_id,
            "product_id": self.product_id,
            "user_id": self.user_id,
            "movement_type": self.movement_type,
            "quantity": float(self.quantity),
            "date_time": self.date_time.isoformat(sep=" "),
            "reason": self.reason,
        }

    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)
