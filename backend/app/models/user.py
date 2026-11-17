import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class User:
    full_name: str
    username: str
    password_hash: str             # store the HASH only, never the plain password
    role: str                      # Admin | Cashier
    contact_number: Optional[str] = None
    account_status: str = "Active"  # Active | Deactivated
    user_id: Optional[int] = None   # from the database (AUTO_INCREMENT)

    def to_dict(self, include_password_hash=False):
        data = {
            "user_id": self.user_id,
            "full_name": self.full_name,
            "username": self.username,
            "role": self.role,
            "contact_number": self.contact_number,
            "account_status": self.account_status,
        }
        # password_hash is left out of the JSON unless you ask for it
        if include_password_hash:
            data["password_hash"] = self.password_hash
        return data

    def to_json(self, include_password_hash=False):
        return json.dumps(self.to_dict(include_password_hash), indent=2)


@dataclass
class Manages:
    # Primary key is (user_id, product_id)
    user_id: int
    product_id: int
    action_type: str               # create | update | archive
    last_modified: datetime = field(default_factory=datetime.now)

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "product_id": self.product_id,
            "last_modified": self.last_modified.isoformat(sep=" "),
            "action_type": self.action_type,
        }

    def to_json(self):
        return json.dumps(self.to_dict(), indent=2)
