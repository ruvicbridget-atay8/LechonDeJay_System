from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from app.services.database_service import DatabaseError, fetch_one
from app.routes.auth import auth_bp
from app.routes.users import users_bp

app = Flask(__name__)

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
app.register_blueprint(users_bp)


if __name__ == "__main__":
    app.run(debug=False)