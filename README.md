# Tablehouse Restaurant Management

A college mini-project with a React/Vite client, a Core PHP JSON API, and a MySQL database. The applications are separate: React JSX runs in the browser, while PHP runs only through Apache. No database credential is sent to the browser.

## Requirements

- Windows 10/11
- XAMPP with Apache, MySQL/MariaDB, phpMyAdmin, PHP 8.1 or newer, and the `pdo_mysql` extension enabled
- Node.js 20.19+ or 22.12+ and npm (Vite 8 requirement)
- A modern browser

The API uses PHP 8.1+ features. For this development project, the default database connection is `127.0.0.1`, database `restaurant`, user `root`, blank password. Configure a separate database account/password for any shared or deployed environment.

## Install and start

1. Put this project at `C:\xampp\htdocs\restaurant`.
2. Apache must be able to see the project under XAMPP's `htdocs` folder. If XAMPP is installed at `C:\xampp`, the project path already matches. If XAMPP is installed elsewhere, create a directory junction from its document root to the project. For example, when XAMPP is at `D:\xampp`, run PowerShell as Administrator:

   ```powershell
   New-Item -ItemType Junction -Path D:\xampp\htdocs\restaurant -Target C:\xampp\htdocs\restaurant
    ```

   Use the actual XAMPP install path if it differs. Do not create the junction if `htdocs\restaurant` already exists.
3. Open the XAMPP Control Panel and start **Apache** and **MySQL**.
4. Open `http://localhost/phpmyadmin/`.
5. Select **Import**, choose `C:\xampp\htdocs\restaurant\database\restaurant.sql`, then select **Import** at the bottom. The file creates the `restaurant` database and its sample data. It drops/recreates project tables, so importing it again resets existing project data.
6. Confirm `http://localhost/restaurant/backend/api/auth/csrf` returns JSON. If Apache reports a rewrite/500 error, enable `mod_rewrite` and `AllowOverride All` for XAMPP's `htdocs` directory, then restart Apache. The included `.htaccess` files route API paths to `backend/api/index.php`.
7. In PowerShell, install and launch the React application:

   ```powershell
   cd C:\xampp\htdocs\restaurant\frontend
   npm install
   npm run dev
   ```

8. Open the Vite URL shown in the terminal, normally `http://127.0.0.1:5173/`. Keep Apache and MySQL running while using the app. Vite proxies `/api` to `http://localhost/restaurant/backend/api`, so the browser talks to a same-origin path and PHP session cookies work during development.

Use `npm run build` to generate `frontend/dist`. The PHP API remains an Apache application; do not place JSX in a PHP file or ask Apache to execute React source.

## Demo accounts

All seeded accounts use the development-only password `password`:

| Role | Email |
| --- | --- |
| Customer | `customer@tablehouse.test` |
| Reception staff | `reception@tablehouse.test` |
| Kitchen staff | `kitchen@tablehouse.test` |
| Administrator | `admin@tablehouse.test` |

The sign-in screen has shortcuts for these accounts. Change these passwords or remove the demo accounts before exposing the app beyond a local development machine. New self-registered accounts always receive the Customer role; an administrator assigns staff roles in **People and roles**.

## Configuration and origins

The API reads database configuration from the PHP process environment:

- `RESTAURANT_DB_HOST` (default `127.0.0.1`)
- `RESTAURANT_DB_NAME` (default `restaurant`)
- `RESTAURANT_DB_USER` (default `root`)
- `RESTAURANT_DB_PASSWORD` (default empty)
- `RESTAURANT_ALLOWED_ORIGIN` (default empty; only needed for cross-origin browser hosting)

Do not place these values in Vite variables or frontend source. Set them in the Apache/PHP environment (for example with Apache `SetEnv` in a local-only server configuration) and restart Apache. Keep secrets out of source control.

For a production build served from an origin separate from Apache, copy `frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL` to the full API URL, for example `http://localhost/restaurant/backend/api`. Set `RESTAURANT_ALLOWED_ORIGIN` to the exact frontend origin, including scheme and port (for example `http://localhost:5173`), and retain credentialed requests. The API intentionally does not allow wildcard origins with cookies. For easiest local setup, use the Vite proxy and leave the cross-origin setting unset. Cross-origin cookies may need `SameSite=None; Secure` and HTTPS depending on browser policy; do not weaken cookie settings for a deployed system.

## Implemented workflows

- **Customer:** register, login/logout, edit name and phone, browse/search/filter available menu items, manage cart quantities, check table availability for date/time/party size, request/cancel/reschedule reservations, select a confirmed reservation for a pre-order, track kitchen status, view bill, make a simulated payment, read notifications, and print a receipt.
- **Reception:** view and confirm/cancel reservations, adjust table capacity/availability, create walk-in orders (optionally linked to a customer ID), monitor order status, generate bills, record simulated payments, and print receipts.
- **Kitchen:** live queue with five-second refresh, status transitions `Placed → Preparing → Ready → Served`, and completed-ticket history.
- **Administrator:** dashboard counts/revenue from MySQL, activate/deactivate accounts and assign the four roles, add/edit categories and menu items, manage table capacity/availability, inspect reservations/orders/bills/payments, and view daily/monthly revenue, popular dishes, and peak order hours.

The simulated payment records a local payment row only. It does not contact a bank, processor, or UPI service.

## API overview

Base URL under Apache: `http://localhost/restaurant/backend/api`

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/csrf`, `/auth/me` | Start CSRF session / current user |
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Customer registration and session authentication |
| PATCH | `/profile` | Update own customer profile |
| GET, POST, PATCH | `/menu`, `/menu/{id}` | Browse; administrator create/edit |
| GET, POST | `/categories` | Browse; administrator create |
| GET, PATCH | `/tables`, `/tables/{id}` | Browse; staff/admin capacity and availability |
| GET | `/availability?...` | Check table, party, time and duration |
| GET, POST, PATCH | `/reservations`, `/reservations/{id}` | Book, view, confirm, cancel or reschedule |
| GET, POST, PATCH | `/orders`, `/orders/{id}` | Create, view and advance orders |
| POST | `/bills` | Create/retrieve the server-priced bill for an order |
| POST | `/payments` | Idempotent simulated payment |
| GET, PATCH | `/notifications`, `/notifications/{id}` | Read and mark own notifications |
| GET | `/admin/dashboard`, `/admin/users`, `/admin/reports` | Administrator-only data and reports |

Successful responses use `{ "data": ... }`; errors use `{ "error": { "message": ..., "details": ... } }`. Mutating requests send the session CSRF token in `X-CSRF-Token`. Sessions use HTTP-only cookies. All role checks and record ownership checks are performed in PHP.

## Database tables

`users`, `restaurant_tables`, `reservations`, `menu_categories`, `menu_items`, `orders`, `order_items`, `bills`, `payments`, `notifications`, and `order_status_history`. Foreign keys, unique constraints, indexes, timestamps, and basic data checks are included. Booking writes lock the table row in a transaction and reject interval overlap using `existing.start_at < requested.end_at AND existing.end_at > requested.start_at`. Order prices are reloaded from the menu in PHP. Bill totals are calculated from persisted order lines. Payment is protected by a bill lock and unique bill/idempotency constraints.

## End-to-end manual test

The complete flow requires a running XAMPP PHP/MySQL environment:

1. Register a new Customer, or use the demo customer.
2. In **Reservations**, choose a future time/table and use **Check availability**. Request it.
3. Sign in as Reception, confirm the pending booking, and verify an overlapping request for that table/time is rejected.
4. Return as the Customer. Choose the confirmed booking, add menu items, and place the pre-order.
5. Sign in as Kitchen. Confirm the ticket appears, then advance it through Preparing, Ready, and Served. The queue also refreshes every five seconds.
6. Sign in as Reception. Generate a bill, record the simulated payment, and print the receipt.
7. Return as Customer. Verify order status, bill/payment, receipt action, and reservation/order notifications.
8. Sign in as Administrator. Check dashboard/report totals, edit a menu item, change an account role, and change table availability.

## Viva questions

1. Why is React JSX served by Vite/the browser instead of executed as PHP?
2. What is the responsibility of each layer: React, Fetch API, PHP REST API, PDO, and MySQL?
3. Why are SQL queries parameterized with PDO prepared statements?
4. What is the difference between authentication and authorization?
5. How does a PHP session cookie identify a signed-in user?
6. What does `password_hash()` store, and why should the original password never be stored?
7. How does the CSRF token protect state-changing requests?
8. How do role checks and ownership checks prevent access to another customer's reservation or bill?
9. Why is a reservation time represented by both `start_at` and `end_at`?
10. Explain the overlap condition `existing.start_at < requested.end_at AND existing.end_at > requested.start_at`.
11. Why do reservation creation and payment use database transactions and row locks?
12. Why does the backend recalculate order totals instead of trusting the cart total?
13. What is an idempotency key, and how does it help prevent duplicate payment records?
14. What is the purpose of foreign keys and indexes in this schema?
15. What is CORS, and why should credentialed CORS never use `Access-Control-Allow-Origin: *`?
16. Why does the kitchen queue poll every five seconds, and what would change with WebSockets?
17. Why is the payment flow called simulated rather than online payment?
18. What additional steps would be needed before deploying this project publicly?

## Current validation notes

The React production build was verified with Vite. PHP files were parsed with a PHP grammar parser because PHP/XAMPP is not installed in the build environment. The SQL import, Apache rewrite behavior, real PHP endpoint tests, and full customer-to-payment workflow still need to be run on a computer with XAMPP/MySQL; the manual checklist above is provided for that environment.
