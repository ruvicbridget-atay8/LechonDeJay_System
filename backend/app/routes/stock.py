from datetime import date

from flask import Blueprint, jsonify, request, session

from app.services import inventory_service
from app.services.auth_service import role_required
from app.services.database_service import DatabaseError
from app.routes.serialization import json_safe


stock_bp = Blueprint("stock", __name__, url_prefix="/stock")

MOVEMENT_TYPES = {
    "in": "Stock In",
    "stock in": "Stock In",
    "out": "Stock Out",
    "stock out": "Stock Out",
    "adjustment": "Adjustment",
}


def parse_movement_type(value):
    if not isinstance(value, str):
        raise DatabaseError("Invalid movement type.", 400)
    movement_type = MOVEMENT_TYPES.get(value.strip().casefold())
    if movement_type is None:
        raise DatabaseError("Invalid movement type.", 400)
    return movement_type


def parse_date(value, field):
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise DatabaseError(f"{field} must be a valid YYYY-MM-DD date.", 400) from None


@stock_bp.route("/movements", methods=["POST"])
@role_required("Admin")
def log_stock_movement():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "A JSON object is required.",
        }), 400

    sku = data.get("sku")
    product_id = data.get("product_id")
    if sku is not None and product_id is not None:
        return jsonify({
            "success": False,
            "message": "Provide either sku or product_id, not both.",
        }), 400
    if sku is not None:
        product = inventory_service.get_product_by_sku(sku)
        product_id = product["product_id"]
    if product_id is None:
        return jsonify({
            "success": False,
            "message": "A product sku or product_id is required.",
        }), 400

    movement = inventory_service.log_manual_movement(
        product_id=product_id,
        user_id=session["user_id"],
        movement_type=parse_movement_type(data.get("movement_type")),
        quantity=data.get("quantity"),
        reason=data.get("reason"),
    )
    return jsonify(json_safe({
        "success": True,
        "message": "Stock movement recorded successfully.",
        "movement": movement,
    })), 201


@stock_bp.route("/movements", methods=["GET"])
@role_required("Admin")
def list_stock_movements():
    movement_type = request.args.get("movement_type")
    if movement_type is not None:
        movement_type = parse_movement_type(movement_type)

    movements = inventory_service.get_stock_movements(
        sku=request.args.get("sku"),
        movement_type=movement_type,
        start_date=parse_date(request.args.get("start_date"), "start_date"),
        end_date=parse_date(request.args.get("end_date"), "end_date"),
    )
    return jsonify(json_safe({"success": True, "movements": movements}))