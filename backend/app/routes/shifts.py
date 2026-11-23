from flask import Blueprint, jsonify, request, session

from app.services import shift_service
from app.services import DatabaseError, role_required

shifts_bp = Blueprint("shifts", __name__)


def respond(data, status=200):
    return jsonify({"success": True, "data": data}), status


def json_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise DatabaseError("A JSON object is required.", 400)
    return body


@shifts_bp.route("/shifts/open", methods=["POST"])
@role_required("Cashier", "Admin")
def open_shift():
    body = json_body()

    if "opening_cash" not in body:
        raise DatabaseError("Opening cash is required.", 400)

    result = shift_service.open_shift(
        user_id=session["user_id"],
        opening_cash=body["opening_cash"],
    )
    return respond(result, 201)


@shifts_bp.route("/shifts/current", methods=["GET"])
@role_required("Cashier", "Admin")
def current_shift():
    user_id = session["user_id"]
    current = shift_service.get_open_shift(user_id)
    return respond(current)


@shifts_bp.route("/shifts/close", methods=["POST"])
@role_required("Cashier", "Admin")
def close_shift():
    body = json_body()

    if "actual_cash" not in body:
        raise DatabaseError("Actual cash is required.", 400)

    shift_id = body.get("shift_id")

    if shift_id is None:
        current = shift_service.get_open_shift(session["user_id"])

        if current is None:
            raise DatabaseError("No open shift found.", 404)

        shift_id = current["shift_id"]

    if type(shift_id) is not int or shift_id <= 0:
        raise DatabaseError("Invalid shift ID.", 400)

    result = shift_service.close_shift(
        shift_id=shift_id,
        user_id=session["user_id"],
        actual_cash=body["actual_cash"],
    )
    return respond(result)


@shifts_bp.route("/shifts", methods=["GET"])
@role_required("Cashier", "Admin")
def list_shifts():
    result = shift_service.list_shifts(
        requester_user_id=session["user_id"],
        start_date=request.args.get("start_date"),
        end_date=request.args.get("end_date"),
        status=request.args.get("status"),
    )
    return respond(result)
