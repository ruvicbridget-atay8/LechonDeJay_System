from flask import Blueprint, jsonify, request
from app.services import config_service
from app.services.auth_service import role_required
from app.services.database_service import DatabaseError, fetch_all

discounts_bp = Blueprint("discounts", __name__)

def get_json_body():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        raise DatabaseError("A JSON object is required.", 400)

    return data

def success(message=None, **data):
    response = {"success": True}

    if message:
        response["message"] = message

    response.update(data)
    return jsonify(response)

# DISCOUNT TYPES
@discounts_bp.route("/discounts", methods=["GET"])
@role_required("Cashier", "Admin")
def list_discounts():
    return success(discounts=config_service.list_discount_types())

@discounts_bp.route("/discounts", methods=["POST"])
@role_required("Admin")
def create_discount():
    data = get_json_body()

    discount_id = config_service.create_discount_type(
        data.get("discount_name"),
        data.get("discount_value"),
    )

    return (
        success(
            message="Discount type created successfully.",
            discount_type_id=discount_id,
        ),
        201,
    )

@discounts_bp.route("/discounts/<int:discount_id>", methods=["PUT"])
@role_required("Admin")
def update_discount(discount_id):
    data = get_json_body()

    config_service.update_discount_type(
        discount_id,
        data.get("discount_name"),
        data.get("discount_value"),
    )
    return success(message="Discount type updated successfully.")

@discounts_bp.route("/discounts/<int:discount_id>", methods=["DELETE"])
@role_required("Admin")
def delete_discount(discount_id):
    config_service.delete_discount_type(discount_id)

    return success(message="Discount type deleted successfully.")

# CATEGORIES
@discounts_bp.route("/categories", methods=["GET"])
@role_required("Cashier", "Admin")
def list_categories():
    return success(categories=config_service.list_categories())

@discounts_bp.route("/categories", methods=["POST"])
@role_required("Admin")
def create_category():
    data = get_json_body()

    category_id = config_service.create_category(data.get("category_name"))

    return (
        success(
            message="Category created successfully.",
            category_id=category_id,
        ),
        201,
    )

@discounts_bp.route("/categories/<int:category_id>", methods=["PUT"])
@role_required("Admin")
def update_category(category_id):
    data = get_json_body()

    config_service.update_category(
        category_id,
        data.get("category_name"),
    )
    return success(message="Category updated successfully.")

@discounts_bp.route("/categories/<int:category_id>", methods=["DELETE"])
@role_required("Admin")
def delete_category(category_id):
    config_service.delete_category(category_id)

    return success(message="Category deleted successfully.")

# PAYMENT METHODS
@discounts_bp.route("/payment-methods", methods=["GET"])
@role_required("Cashier", "Admin")
def list_payment_methods():
    methods = fetch_all("""
        SELECT payment_method_id, method_name
        FROM payment_methods
        ORDER BY payment_method_id
        """)
    return success(payment_methods=methods)
