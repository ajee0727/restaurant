CREATE DATABASE IF NOT EXISTS restaurant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE restaurant;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bills;
DROP TABLE IF EXISTS order_status_history;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS restaurant_tables;
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS menu_categories;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('customer','reception','kitchen','admin') NOT NULL DEFAULT 'customer',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE restaurant_tables (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_number VARCHAR(20) NOT NULL UNIQUE,
  capacity TINYINT UNSIGNED NOT NULL,
  area VARCHAR(60) NOT NULL DEFAULT 'Main dining',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (capacity > 0)
) ENGINE=InnoDB;

CREATE TABLE menu_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE menu_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  price DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(500) NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_menu_category FOREIGN KEY (category_id) REFERENCES menu_categories(id),
  INDEX idx_menu_available_category (is_available, category_id),
  CHECK (price >= 0)
) ENGINE=InnoDB;

CREATE TABLE reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  table_id BIGINT UNSIGNED NOT NULL,
  guest_count TINYINT UNSIGNED NOT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM('pending','confirmed','cancelled','completed') NOT NULL DEFAULT 'pending',
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reservation_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_reservation_table FOREIGN KEY (table_id) REFERENCES restaurant_tables(id),
  INDEX idx_reservation_overlap (table_id, status, start_at, end_at),
  INDEX idx_reservation_user (user_id, start_at),
  CHECK (guest_count > 0),
  CHECK (end_at > start_at)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  reservation_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  status ENUM('placed','preparing','ready','served','cancelled') NOT NULL DEFAULT 'placed',
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_order_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_order_status_created (status, created_at),
  INDEX idx_order_user (user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(120) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_order_item_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_item_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
  INDEX idx_order_item_order (order_id),
  CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE order_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  status ENUM('placed','preparing','ready','served','cancelled') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_history_user FOREIGN KEY (changed_by) REFERENCES users(id),
  INDEX idx_history_order_created (order_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE bills (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL UNIQUE,
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(10,2) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bill_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_bill_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id BIGINT UNSIGNED NOT NULL UNIQUE,
  idempotency_key VARCHAR(80) NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  method ENUM('cash','card','upi','simulated') NOT NULL DEFAULT 'simulated',
  status ENUM('paid','refunded') NOT NULL DEFAULT 'paid',
  reference VARCHAR(80) NOT NULL UNIQUE,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_bill FOREIGN KEY (bill_id) REFERENCES bills(id),
  CHECK (amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  message VARCHAR(500) NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notification_user_created (user_id, created_at)
) ENGINE=InnoDB;

INSERT INTO users (name, email, phone, password_hash, role) VALUES
('Demo Customer', 'customer@tablehouse.test', '9000000001', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'customer'),
('Reception Demo', 'reception@tablehouse.test', '9000000002', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'reception'),
('Kitchen Demo', 'kitchen@tablehouse.test', '9000000003', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'kitchen'),
('Administrator', 'admin@tablehouse.test', '9000000004', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');

INSERT INTO restaurant_tables (table_number, capacity, area) VALUES
('T01', 2, 'Window'), ('T02', 2, 'Window'), ('T03', 4, 'Main dining'),
('T04', 4, 'Main dining'), ('T05', 6, 'Garden'), ('T06', 8, 'Private room');

INSERT INTO menu_categories (name, description) VALUES
('Small plates', 'A few good things to start'), ('Mains', 'The heart of the table'),
('Desserts', 'Something sweet to finish'), ('Drinks', 'Made here, poured fresh');

INSERT INTO menu_items (category_id, name, description, price) VALUES
(1, 'Charred corn ribs', 'Lime, smoked paprika, green herb butter', 8.50),
(1, 'Burrata & tomatoes', 'Heirloom tomato, basil oil, sourdough', 12.00),
(2, 'Wild mushroom risotto', 'Arborio rice, parmesan, crispy sage', 19.50),
(2, 'Roast chicken', 'Half chicken, lemon jus, seasonal greens', 24.00),
(2, 'Paneer tikka bowl', 'Tandoor paneer, rice, mint yogurt', 18.00),
(3, 'Olive oil cake', 'Citrus cream, macerated berries', 9.00),
(4, 'House lemonade', 'Fresh lemon, mint, a little sparkle', 5.00),
(4, 'Masala chai', 'Black tea, warming spices, steamed milk', 4.50);
