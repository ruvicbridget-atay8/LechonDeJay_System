import os
from pathlib import Path
from dotenv import load_dotenv

# Load variables
load_dotenv(Path(__file__).resolve().with_name(".env"))

class Config:
    FLASK_ENV = os.getenv("FLASK_ENV")
    IS_PRODUCTION = (
        FLASK_ENV.strip().casefold() == "production"
        if FLASK_ENV
        else False
    ) or os.getenv("RENDER", "").strip().casefold() == "true"
    DB_HOST = os.getenv("DB_HOST")
    DB_PORT = os.getenv("DB_PORT")
    DB_USER = os.getenv("DB_USER")
    DB_PASSWORD = os.getenv("DB_PASSWORD")
    DB_NAME = os.getenv("DB_NAME")
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "")
    
    SECRET_KEY = os.getenv("SECRET_KEY")
    CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
    CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
    CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
    