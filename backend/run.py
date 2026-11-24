from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge
from config import Config
from app.services import DatabaseError, fetch_one
from app.routes import (
    approvals_bp,
    auth_bp,
    discounts_bp,
    inventory_bp,
    reports_bp,
    shifts_bp,
    stock_bp,
    transactions_bp,
    users_bp,
)

app = Flask(__name__)
app.json.sort_keys = False
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024 + 64 * 1024


@app.errorhandler(RequestEntityTooLarge)
def handle_upload_too_large(_error):
    return jsonify({"success": False, "message": "Image must be 2 MB or smaller."}), 400

@app.errorhandler(DatabaseError)
def handle_database_error(error):
    return jsonify({"success": False, "message": error.message}), error.status


# Config
if not Config.SECRET_KEY:
    raise RuntimeError("SECRET_KEY must be configured in the environment.")
app.config["SECRET_KEY"] = Config.SECRET_KEY

# Enable CORS
CORS(app, supports_credentials=True, origins=["http://127.0.0.1:5500"])

# Health check
@app.route("/health")
def health():
    return {
        "status": "ok",
    }

@app.route("/database-test")
def database_test():
    try:
        fetch_one("SELECT 1")
    except Exception:
        app.logger.exception("Database connectivity check failed")
        return {
            "status": "error",
            "message": "Database unavailable.",
        }, 503
    return {"status": "success"}

# System Routes
app.register_blueprint(auth_bp)
app.register_blueprint(inventory_bp)
app.register_blueprint(stock_bp)
app.register_blueprint(users_bp)
app.register_blueprint(shifts_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(discounts_bp)
app.register_blueprint(transactions_bp)
app.register_blueprint(approvals_bp)

if __name__ == "__main__":
    app.run(debug=False)