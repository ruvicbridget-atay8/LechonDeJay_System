import sys
from pathlib import Path
from unittest.mock import patch
import pytest
from flask import Flask, jsonify

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
from app.routes.discounts import discounts_bp
from app.services.database_service import DatabaseError

@pytest.fixture
def client():
    app = Flask(__name__)
    app.config.update(TESTING=True, SECRET_KEY='tests-only')
    app.register_blueprint(discounts_bp)
    @app.errorhandler(DatabaseError)
    def handle_error(exc):
        return jsonify(success=False, message=exc.message), exc.status
    return app.test_client()

def auth(client, role='Admin'):
    with client.session_transaction() as session:
        session['user_id'] = 1
    return patch('app.services.auth_service._get_account', return_value={
        'user_id': 1, 'username': 'tester', 'full_name': 'Test User',
        'role': role, 'account_status': 'Active'})

def test_lists_for_cashier(client):
    with auth(client, 'Cashier'):
        for url, service, key in (
            ('/discounts', 'list_discount_types', 'discounts'),
            ('/categories', 'list_categories', 'categories'),
        ):
            with patch(f'app.routes.discounts.config_service.{service}', return_value=[{'id': 1}]):
                response = client.get(url)
            assert response.status_code == 200
            assert response.json[key] == [{'id': 1}]

def test_payment_methods(client):
    with auth(client, 'Cashier'), patch('app.routes.discounts.fetch_all', return_value=[{'payment_method_id': 1, 'method_name': 'Cash'}]):
        response = client.get('/payment-methods')
    assert response.status_code == 200
    assert response.json['payment_methods'][0]['method_name'] == 'Cash'

def test_admin_create(client):
    with auth(client):
        for url, payload, service, expected_key in (
            ('/discounts', {'discount_name': 'Promo', 'discount_value': 10}, 'create_discount_type', 'discount_type_id'),
            ('/categories', {'category_name': 'Meals'}, 'create_category', 'category_id'),
        ):
            with patch(f'app.routes.discounts.config_service.{service}', return_value=7) as mock:
                response = client.post(url, json=payload)
            assert response.status_code == 201
            assert response.json[expected_key] == 7
            mock.assert_called_once()

def test_admin_update_delete(client):
    with auth(client):
        for method, url, payload, service in (
            ('put', '/discounts/3', {'discount_name': 'Promo', 'discount_value': 5}, 'update_discount_type'),
            ('delete', '/discounts/3', None, 'delete_discount_type'),
            ('put', '/categories/3', {'category_name': 'Meals'}, 'update_category'),
            ('delete', '/categories/3', None, 'delete_category'),
        ):
            with patch(f'app.routes.discounts.config_service.{service}') as mock:
                response = getattr(client, method)(url, json=payload) if payload is not None else getattr(client, method)(url)
            assert response.status_code == 200
            assert response.json['success'] is True
            mock.assert_called_once()

def test_cashier_cannot_modify(client):
    with auth(client, 'Cashier'):
        for method, url, payload in (
            ('post', '/discounts', {'discount_name': 'Promo', 'discount_value': 10}),
            ('put', '/discounts/3', {'discount_name': 'Promo', 'discount_value': 5}),
            ('delete', '/discounts/3', None),
            ('post', '/categories', {'category_name': 'Meals'}),
            ('put', '/categories/3', {'category_name': 'Meals'}),
            ('delete', '/categories/3', None),
        ):
            response = getattr(client, method)(url, json=payload) if payload is not None else getattr(client, method)(url)
            assert response.status_code == 403

def test_unauthenticated(client):
    for url in ('/discounts', '/categories', '/payment-methods'):
        assert client.get(url).status_code == 401

def test_create_requires_json_object(client):
    with auth(client):
        for url in ('/discounts', '/categories'):
            response = client.post(url, json=[])
            assert response.status_code == 400

def test_service_validation_error_propagates(client):
    with auth(client), patch('app.routes.discounts.config_service.create_discount_type', side_effect=DatabaseError('Invalid discount.', 400)):
        response = client.post('/discounts', json={'discount_name': 'Regular', 'discount_value': 20})
    assert response.status_code == 400
    assert response.json['message'] == 'Invalid discount.'
