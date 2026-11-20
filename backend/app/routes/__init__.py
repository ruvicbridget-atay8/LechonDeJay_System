"""Route modules and Flask blueprint exports."""

from .serialization import json_safe
from .approvals import approvals_bp
from .auth import auth_bp
from .discounts import discounts_bp
from .inventory import inventory_bp
from .reports import reports_bp
from .shifts import shifts_bp
from .stock import stock_bp
from .transactions import transactions_bp
from .users import users_bp
from . import (
    approvals,
    auth,
    discounts,
    inventory,
    reports,
    serialization,
    shifts,
    stock,
    transactions,
    users,
)

__all__ = [
    "approvals",
    "auth",
    "discounts",
    "inventory",
    "reports",
    "serialization",
    "shifts",
    "stock",
    "transactions",
    "users",
    "json_safe",
    "approvals_bp",
    "auth_bp",
    "discounts_bp",
    "inventory_bp",
    "reports_bp",
    "shifts_bp",
    "stock_bp",
    "transactions_bp",
    "users_bp",
]