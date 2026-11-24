from datetime import date, datetime
from decimal import Decimal


def json_safe(value, datetime_separator=" "):
    if isinstance(value, datetime):
        return value.isoformat(sep=datetime_separator)
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, dict):
        return {
            key: json_safe(item, datetime_separator)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [json_safe(item, datetime_separator) for item in value]
    return value
