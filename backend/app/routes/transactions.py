from datetime import date

from flask import Blueprint, jsonify, request, session

from app.services import transaction_service
from app.services.auth_service import role_required
from app.services.database_service import DatabaseError

transactions_bp = Blueprint("transactions", __name__)


def json_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise DatabaseError("A JSON object is required.", 400)
    return body


def current_user_id():
    return session["user_id"]


def valid_id(transaction_id):
    if transaction_id <= 0:
        raise DatabaseError("Invalid transaction ID.", 400)
    return transaction_id


def respond(result, code=200):
    return jsonify({"success": True, "data": result}), code


@transactions_bp.route("/transactions/calculate", methods=["POST"])
@role_required("Cashier", "Admin")
def calculate_cart():
    body = json_body()
    if not isinstance(body.get("cart_items"), list):
        raise DatabaseError("cart_items must be a list.", 400)
    return respond(transaction_service.calculate_cart(body["cart_items"]))


@transactions_bp.route("/transactions", methods=["POST"])
@transactions_bp.route("/transactions/checkout", methods=["POST"])
@role_required("Cashier", "Admin")
def checkout():
    body = json_body()
    result = transaction_service.checkout(
        cart_items=body.get("cart_items"),
        order_type=body.get("order_type"),
        discount_type_id=body.get("discount_type_id"),
        payment_method_id=body.get("payment_method_id"),
        processed_by_user_id=current_user_id(),
        amount_tendered=body.get("amount_tendered"),
        discount_amount=body.get("discount_amount", 0),
        discount_id_number=body.get("discount_id_number"),
        discount_name=body.get("discount_name"),
        customer_name=body.get("customer_name"),
        customer_contact=body.get("customer_contact"),
    )
    return respond(result, 201)


@transactions_bp.route("/transactions", methods=["GET"])
@role_required("Cashier", "Admin")
def list_transactions():
    today = date.today().isoformat()

    return respond(
        transaction_service.list_transactions(
            requester_user_id=current_user_id(),
            start_date=request.args.get("start_date", today),
            end_date=request.args.get("end_date", today),
            status=request.args.get("status"),
            order_type=request.args.get("order_type"),
            customer_name=(
                request.args.get("customer_name")
                or request.args.get("customer")
                or request.args.get("customer_contact")
            ),
        )
    )


@transactions_bp.route("/transactions/<int:transaction_id>", methods=["GET"])
@role_required("Cashier", "Admin")
def get_transaction(transaction_id):
    return respond(
        transaction_service.get_transaction(valid_id(transaction_id), current_user_id())
    )


@transactions_bp.route("/transactions/<int:transaction_id>/receipt", methods=["GET"])
@role_required("Cashier", "Admin")
def get_receipt(transaction_id):
    return respond(
        transaction_service.get_receipt(valid_id(transaction_id), current_user_id())
    )


@transactions_bp.route(
    "/transactions/<int:transaction_id>/kitchen-ticket", methods=["GET"]
)
@role_required("Cashier", "Admin")
def get_kitchen_ticket(transaction_id):
    return respond(
        transaction_service.get_kitchen_ticket(
            valid_id(transaction_id), current_user_id()
        )
    )


@transactions_bp.route("/transactions/<int:transaction_id>", methods=["PUT"])
@transactions_bp.route("/transactions/<int:transaction_id>/customer", methods=["PATCH"])
@role_required("Admin")
def correct_transaction(transaction_id):
    transaction_id = valid_id(transaction_id)
    body = json_body()
    allowed = {
        "reason",
        "customer_name",
        "customer_contact",
        "discount_id_number",
        "discount_name",
    }
    unexpected = set(body) - allowed
    if unexpected:
        raise DatabaseError(
            "Only customer and discount ID details can be corrected. Unsupported fields: "
            + ", ".join(sorted(unexpected)),
            400,
        )
    if not (set(body) & (allowed - {"reason"})):
        raise DatabaseError("Provide at least one customer field to correct.", 400)

    existing = transaction_service.get_transaction(transaction_id, current_user_id())
    result = transaction_service.correct_customer_details(
        transaction_id=transaction_id,
        admin_user_id=current_user_id(),
        reason=body.get("reason"),
        customer_name=body.get("customer_name", existing["customer_name"]),
        customer_contact=body.get("customer_contact", existing["customer_contact"]),
        discount_id_number=body.get(
            "discount_id_number", existing["discount_id_number"]
        ),
        discount_name=body.get("discount_name", existing["discount_name"]),
    )
    return respond(result)
