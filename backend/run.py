from flask import Flask
from flask_cors import CORS
from config import Config
from app.services.database_service import get_connection

app = Flask(__name__)

# Config
app.config["SECRET_KEY"] = Config.SECRET_KEY

# Enable CORS
CORS(app)

# Health check
@app.route("/health")
def health():
    return {
        "status": "ok",
    }

@app.route("/database-test")
def database_test():
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute("SELECT DATABASE();")
        result = cursor.fetchone()
        cursor.close()
        connection.close()

        return {
            "status": "success",
            "database": result[0]
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

# System Routes


if __name__ == "__main__":
    app.run(debug=True)