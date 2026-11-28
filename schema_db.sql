CREATE DATABASE IF NOT EXISTS lechondejay_db;
USE lechondejay_db;

-- =========================
-- DISCOUNT TYPES
-- =========================
CREATE TABLE discount_types (
    discount_type_id INT AUTO_INCREMENT PRIMARY KEY,
    discount_name VARCHAR(50) NOT NULL UNIQUE,
    discount_value DECIMAL(10,2) NOT NULL DEFAULT 0.00
);

INSERT INTO discount_types (discount_type_id, discount_name, discount_value)
VALUES
(1, 'Regular', 0.00),
(2, 'VIP', 10.00),
(3, 'Promo', 5.00),
(4, 'Senior Citizen', 20.00),
(5, 'PWD', 20.00);

-- =========================
-- PAYMENT METHODS
-- =========================
CREATE TABLE payment_methods (
    payment_method_id INT AUTO_INCREMENT PRIMARY KEY,
    method_name VARCHAR(30) NOT NULL UNIQUE
);

-- =========================
-- CATEGORIES
-- =========================
CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL UNIQUE
);

-- =========================
-- USERS
-- =========================
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,

    role ENUM(
        'Admin',
        'Cashier'
    ) NOT NULL,

    contact_number VARCHAR(20),

    account_status ENUM(
        'Active',
        'Deactivated'
    ) DEFAULT 'Active'
);

-- =========================
-- SHIFTS
-- =========================
CREATE TABLE shifts (
    shift_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    shift_date DATE NOT NULL,
    opening_cash DECIMAL(10,2) NOT NULL,
    cash_sales DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    expected_cash DECIMAL(10,2) NOT NULL,
    actual_cash DECIMAL(10,2),
    cash_difference DECIMAL(10,2),

    CONSTRAINT fk_shift_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id),

    UNIQUE (user_id, shift_date)
);

-- =========================
-- PRODUCTS
-- =========================
CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(30) NOT NULL UNIQUE,
    category_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,

    unit ENUM(
        'piece',
        'kilogram',
        'tray'
    ) NOT NULL,

    current_stock DECIMAL(10,2) NOT NULL DEFAULT 0,
    reorder_level DECIMAL(10,2) NOT NULL DEFAULT 0,

    status ENUM(
        'Available',
        'Unavailable',
        'Archived'
    ) DEFAULT 'Available',

    product_type ENUM(
        'Finished Good',
        'Raw Material'
    ) NOT NULL,

    is_addon BOOLEAN NOT NULL DEFAULT FALSE,
    size VARCHAR(30),
    kilos DECIMAL(6,2),
    serving_pax INT,
    expiry_date DATE,

    CONSTRAINT fk_product_category
        FOREIGN KEY (category_id)
        REFERENCES categories(category_id)
);

UPDATE products
SET is_addon = TRUE
WHERE sku IN ('SNK-003', 'SNK-004', 'DRK-001');

-- =========================
-- TRANSACTIONS
-- =========================
CREATE TABLE transactions (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(20) NOT NULL UNIQUE,
    date_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    order_type ENUM(
        'Dine-In',
        'Take-Out'
    ) NOT NULL,

    item_name VARCHAR(100),
    amount DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_due DECIMAL(10,2) NOT NULL,

    status ENUM(
        'Completed',
        'Voided',
        'Refunded'
    ) NOT NULL,

    void_refund_reason VARCHAR(255),
    discount_id_number VARCHAR(30),
    discount_name VARCHAR(100),
    customer_name VARCHAR(100),
    customer_contact VARCHAR(20),
    discount_type_id INT NOT NULL,
    payment_method_id INT NOT NULL,
    processed_by_user_id INT NOT NULL,
    approved_by_user_id INT,

    CONSTRAINT fk_transaction_discount
        FOREIGN KEY (discount_type_id)
        REFERENCES discount_types(discount_type_id),

    CONSTRAINT fk_transaction_payment
        FOREIGN KEY (payment_method_id)
        REFERENCES payment_methods(payment_method_id),

    CONSTRAINT fk_transaction_staff
        FOREIGN KEY (processed_by_user_id)
        REFERENCES users(user_id),

    CONSTRAINT fk_transaction_approver
        FOREIGN KEY (approved_by_user_id)
        REFERENCES users(user_id)
);

-- =========================
-- TRANSACTION ITEMS
-- =========================
CREATE TABLE transaction_items (
    transaction_id INT NOT NULL,
    line_no INT NOT NULL,
    product_id INT NOT NULL,
    parent_line_no INT,
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(10,2) NOT NULL,
    is_addon BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (transaction_id, line_no),

    CONSTRAINT fk_ti_transaction
        FOREIGN KEY (transaction_id)
        REFERENCES transactions(transaction_id),

    CONSTRAINT fk_ti_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT fk_ti_parent
        FOREIGN KEY (transaction_id, parent_line_no)
        REFERENCES transaction_items(transaction_id, line_no)
);

-- =========================
-- MANAGES (USER <-> PRODUCT)
-- =========================
CREATE TABLE manages (
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    last_modified DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    action_type ENUM(
        'create',
        'update',
        'archive'
    ) NOT NULL,

    PRIMARY KEY (user_id, product_id),

    CONSTRAINT fk_manage_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id),

    CONSTRAINT fk_manage_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id)
);

-- =========================
-- STOCK MOVEMENT
-- =========================
CREATE TABLE stock_movement (
    movement_id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    user_id INT NOT NULL,

    movement_type ENUM(
        'Stock In',
        'Stock Out',
        'Adjustment'
    ) NOT NULL,

    quantity DECIMAL(10,2) NOT NULL,
    date_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    reason ENUM(
        'Delivery',      -- Stock In
        'Void Reversal', -- Automatic Stock In when a transaction is Voided
        'Sale',          -- Automatic Stock Out for Cashier
        'Spoilage',      -- Manual Stock Out
        'Wastage',       -- Manual Stock Out
        'Damaged',       -- Manual Stock Out
        'Expired',       -- Manual Stock Out
        'Count Correction'
    ) NOT NULL,

    CONSTRAINT fk_stock_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id),

    CONSTRAINT fk_stock_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id),

    CONSTRAINT chk_stock_reason
    CHECK (
        (movement_type = 'Stock In'
            AND reason IN ('Delivery', 'Void Reversal'))

        OR

        (movement_type = 'Stock Out'
            AND reason IN (
                'Sale',
                'Spoilage',
                'Wastage',
                'Damaged',
                'Expired'
            ))

        OR

        (movement_type = 'Adjustment'
            AND reason = 'Count Correction')
    )
);
