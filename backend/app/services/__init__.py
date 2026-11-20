"""Service modules and commonly used database/auth exports."""

from . import (
    account_service,
    approval_service,
    auth_service,
    config_service,
    database_service,
    inventory_service,
    report_service,
    shift_service,
    sync_service,
    transaction_service,
)
from .auth_service import authenticate, logout_user, role_required
from .database_service import (
    DatabaseError,
    db_transaction,
    fetch_all,
    fetch_one,
    get_connection,
)

__all__ = [
    "account_service",
    "approval_service",
    "auth_service",
    "config_service",
    "database_service",
    "inventory_service",
    "report_service",
    "shift_service",
    "sync_service",
    "transaction_service",
    "authenticate",
    "logout_user",
    "role_required",
    "DatabaseError",
    "db_transaction",
    "fetch_all",
    "fetch_one",
    "get_connection",
]