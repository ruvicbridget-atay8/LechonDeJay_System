# Lechon De Jay System

A full-stack point-of-sale and inventory system for Lechon De Jay. It provides
authentication, transactions, stock management, shifts, discounts, reports,
accounts, and approval workflows.

## Technology

- Frontend: HTML, CSS, and JavaScript
- Backend: Python 3.12 and Flask
- Database: MySQL 8.0
- Image storage: Cloudinary
- Containerization: Docker
- Deployment: Render

## Features

- POS transactions and payment processing
- Inventory, stock movements, and product images
- Shift opening and closing
- Discounts and transaction refunds or voiding
- Sales and inventory reports
- User accounts, roles, and approval requests
- Session-based authentication

## Project Structure

backend/
  app/
    models/
    routes/
    services/
  config.py
  requirements.txt
  run.py
frontend/
  assets/
  scripts/
  styles/
database/
  migrations/
  schema.sql
  seed_data.sql
docker-compose.yml


## Requirements

- Docker Desktop with Docker Compose
- Alternatively:
  - Python 3.12
  - MySQL 8.0

## Docker Setup

Create a `.env` file in the repository root. Do not commit this file.

```dotenv
DB_USER=lechon_app
DB_PASSWORD=replace-with-a-database-password
MYSQL_ROOT_PASSWORD=replace-with-a-root-password
SECRET_KEY=replace-with-a-long-random-secret
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Start the application:

```powershell
docker compose up --build
```

Services:

- Frontend: http://127.0.0.1:8080
- Backend: http://127.0.0.1:5000
- Health check: http://127.0.0.1:5000/health
- Database connectivity: http://127.0.0.1:5000/database-test

Stop the services:

```powershell
docker compose down
```

To remove the MySQL data volume as well:

```powershell
docker compose down -v
```

## Local Python and MySQL Setup

1. Create a MySQL database named `lechondejay_db`.
2. Run the SQL files in `database/` in numeric order, starting with the schema
   and migrations, followed by triggers and seed data.
3. Create `backend/.env`:

```dotenv
FLASK_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=your-mysql-user
DB_PASSWORD=your-mysql-password
DB_NAME=lechondejay_db
SECRET_KEY=replace-with-a-long-random-secret
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

4. Install and run the backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```

5. Serve `frontend/` with VS Code Live Server or another static HTTP server.
   For local API requests, set `API_BASE_URL` in
   `frontend/scripts/api.js` to `http://127.0.0.1:5000`.

The backend requires `SECRET_KEY` and MySQL connection settings. Image uploads
require valid Cloudinary credentials.

## Test Accounts

The MySQL seed data creates development accounts for testing:

| Role    | Username   | Password       |
|---------|------------|----------------|
| Admin   | `admin`    | `Admin@123`    |
| Cashier | `cashier1` | `Cashier@123`  |

**Note:** The test application may take time to load every time it starts because
it is hosted on a free-tier service that spins down while inactive.

These accounts are for local development and Docker testing only. Change or
remove them before using the system in a production environment.

## Tests

Run the backend test suite from the repository root:

```powershell
python -m pytest backend/tests
```

## API Overview

The Flask API includes routes for:

- `/auth`
- `/inventory`
- `/stock`
- `/users`
- `/shifts`
- `/reports`
- `/discounts`
- `/transactions`
- `/approvals`

All mutating API requests use JSON or multipart form data where applicable.
Session cookies are used for authentication.

## Security

- Keep database passwords, Flask secrets, and Cloudinary credentials private.
- Do not commit `.env` files.
- Replace the development credentials before deploying.
- If credentials have already been exposed in source control or shared files,
  rotate them in MySQL and Cloudinary immediately.
