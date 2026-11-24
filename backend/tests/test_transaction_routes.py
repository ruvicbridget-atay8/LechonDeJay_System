import sys
from pathlib import Path
from datetime import datetime
from unittest.mock import patch
import pytest
from flask import Flask, jsonify

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
from app.routes.transactions import transactions_bp
from app.services.database_service import DatabaseError

@pytest.fixture
def client():
    app = Flask(__name__)
    app.config.update(TESTING=True, SECRET_KEY='tests-only')
    app.register_blueprint(transactions_bp)
    @app.errorhandler(DatabaseError)
    def handle_error(exc):
        return jsonify(success=False, message=exc.message), exc.status
    return app.test_client()

def auth(client, role='Cashier'):
    with client.session_transaction() as session:
        session['user_id'] = 1
    return patch('app.services.auth_service._get_account', return_value={
        'user_id': 1, 'username': 'tester', 'full_name': 'Test User',
        'role': role, 'account_status': 'Active'})

def test_calculate_cart(client):
    cart = [{'product_id': 2, 'quantity': 1}]
    with auth(client), patch('app.routes.transactions.transaction_service.calculate_cart', return_value={'subtotal': '100.00'}) as mock:
        response = client.post('/transactions/calculate', json={'cart_items': cart})
    assert response.status_code == 200
    assert response.json['data']['subtotal'] == '100.00'
    mock.assert_called_once_with(cart)

def test_calculate_rejects_bad_body(client):
    with auth(client):
        for body in ([], {}, {'cart_items': 'not a list'}):
            response = client.post('/transactions/calculate', json=body)
            assert response.status_code == 400

def test_checkout_both_routes(client):
    payload = {'cart_items': [{'product_id': 2, 'quantity': 1}], 'order_type': 'Take-Out',
               'discount_type_id': 1, 'payment_method_id': 1, 'amount_tendered': 200}
    with auth(client), patch('app.routes.transactions.transaction_service.checkout', return_value={'transaction_id': 9}) as mock:
        for url in ('/transactions', '/transactions/checkout'):
            response = client.post(url, json=payload)
            assert response.status_code == 201
            assert response.json['data']['transaction_id'] == 9
            assert mock.call_args.kwargs['processed_by_user_id'] == 1
            assert mock.call_args.kwargs['discount_amount'] == 0
    assert mock.call_count == 2

def test_checkout_service_error(client):
    with auth(client), patch('app.routes.transactions.transaction_service.checkout', side_effect=DatabaseError('Insufficient cash tendered.', 400)):
        response = client.post('/transactions/checkout', json={'cart_items': []})
    assert response.status_code == 400
    assert response.json['message'] == 'Insufficient cash tendered.'

def test_list_transactions_filters(client):
    with auth(client), patch('app.routes.transactions.transaction_service.list_transactions', return_value=[]) as mock:
        response = client.get('/transactions?start_date=2026-11-01&end_date=2026-11-19&status=Completed&order_type=Take-Out&customer=Jay')
    assert response.status_code == 200
    assert response.json['data'] == []
    assert mock.call_args.kwargs == {
        'requester_user_id': 1, 'start_date': '2026-11-01', 'end_date': '2026-11-19',
        'status': 'Completed', 'order_type': 'Take-Out', 'customer_name': 'Jay'}


def test_list_transactions_serializes_local_timestamp(client):
    row = {'transaction_id': 9, 'date_time': datetime(2026, 11, 24, 12, 9)}
    with auth(client), patch(
        'app.routes.transactions.transaction_service.list_transactions',
        return_value=[row],
    ):
        response = client.get('/transactions')

    assert response.status_code == 200
    assert response.json['data'][0]['date_time'] == '2026-11-24T12:09:00'


def test_get_transaction_resources(client):
    for url, service in (
        ('/transactions/3', 'get_transaction'),
        ('/transactions/3/receipt', 'get_receipt'),
        ('/transactions/3/kitchen-ticket', 'get_kitchen_ticket'),
    ):
        with auth(client), patch(f'app.routes.transactions.transaction_service.{service}', return_value={'transaction_id': 3}) as mock:
            response = client.get(url)
        assert response.status_code == 200
        assert response.json['data']['transaction_id'] == 3
        mock.assert_called_once_with(3, 1)

def test_admin_correct_customer(client):
    original = {'customer_name': 'Old', 'customer_contact': '123', 'discount_id_number': None, 'discount_name': None}
    with auth(client, 'Admin'), patch('app.routes.transactions.transaction_service.get_transaction', return_value=original):
        for method, url in [('patch', '/transactions/3/customer'), ('put', '/transactions/3')]:
            with patch('app.routes.transactions.transaction_service.correct_customer_details', return_value={'transaction_id': 3}) as mock:
                response = getattr(client, method)(url, json={'reason': 'Typo', 'customer_name': 'New'})
            assert response.status_code == 200
            assert mock.call_args.kwargs['customer_name'] == 'New'
            assert mock.call_args.kwargs['customer_contact'] == '123'

def test_correction_rejects_invalid_body(client):
    with auth(client, 'Admin'):
        for body in ({'reason': 'Typo'}, {'reason': 'Typo', 'total_due': 1}, []):
            response = client.patch('/transactions/3/customer', json=body)
            assert response.status_code == 400

def test_cashier_cannot_correct(client):
    with auth(client, 'Cashier'):
        response = client.patch('/transactions/3/customer', json={'reason': 'Typo', 'customer_name': 'New'})
    assert response.status_code == 403

def test_unauthenticated(client):
    for url in ('/transactions', '/transactions/calculate', '/transactions/3'):
        response = client.post(url, json={}) if url.endswith('/calculate') else client.get(url)
        assert response.status_code == 401

def test_invalid_transaction_id(client):
    with auth(client):
        response = client.get('/transactions/0')
    assert response.status_code == 400
