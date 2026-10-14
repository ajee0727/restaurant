<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$allowedOrigin = getenv('RESTAURANT_ALLOWED_ORIGIN') ?: '';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($allowedOrigin !== '' && hash_equals($allowedOrigin, $origin)) {
    header("Access-Control-Allow-Origin: {$allowedOrigin}");
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Lax',
    'path' => '/',
]);
session_start();

function respond(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode(['data' => $data], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $status = 400, array $details = []): never
{
    http_response_code($status);
    echo json_encode(['error' => ['message' => $message, 'details' => $details]], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array
{
    $decoded = json_decode(file_get_contents('php://input') ?: '{}', true);
    if (!is_array($decoded)) {
        fail('Request body must be a JSON object.', 400);
    }
    return $decoded;
}

function currentUser(): array
{
    if (empty($_SESSION['user'])) {
        fail('Please sign in to continue.', 401);
    }
    $query = database()->prepare('SELECT id, name, email, role, is_active FROM users WHERE id = ? LIMIT 1');
    $query->execute([$_SESSION['user']['id']]);
    $user = $query->fetch();
    if (!$user || !(int)$user['is_active']) {
        $_SESSION = [];
        session_destroy();
        fail('Your account is inactive. Contact the restaurant administrator.', 401);
    }
    $_SESSION['user'] = [
        'id' => (int)$user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
    ];
    return $_SESSION['user'];
}

function requireRole(array $roles): array
{
    $user = currentUser();
    if (!in_array($user['role'], $roles, true)) {
        fail('You do not have permission to perform this action.', 403);
    }
    return $user;
}

function requireCsrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $token)) {
        fail('Your session token has expired. Refresh and try again.', 419);
    }
}

function notifyUser(PDO $pdo, int $userId, string $title, string $message): void
{
    $query = $pdo->prepare('INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)');
    $query->execute([$userId, $title, $message]);
}

function reservationRow(PDO $pdo, int $id): array
{
    $query = $pdo->prepare('SELECT r.*, u.name AS guest_name, u.email, u.phone, t.table_number, t.capacity FROM reservations r JOIN users u ON u.id = r.user_id JOIN restaurant_tables t ON t.id = r.table_id WHERE r.id = ?');
    $query->execute([$id]);
    $row = $query->fetch();
    if (!$row) {
        fail('Reservation not found.', 404);
    }
    return $row;
}

function orderRow(PDO $pdo, int $id): array
{
    $query = $pdo->prepare('SELECT o.*, u.name AS customer_name, r.id AS reservation_number, t.table_number FROM orders o LEFT JOIN users u ON u.id = o.user_id LEFT JOIN reservations r ON r.id = o.reservation_id LEFT JOIN restaurant_tables t ON t.id = r.table_id WHERE o.id = ?');
    $query->execute([$id]);
    $row = $query->fetch();
    if (!$row) {
        fail('Order not found.', 404);
    }
    $items = $pdo->prepare('SELECT id, menu_item_id, item_name, unit_price, quantity, line_total FROM order_items WHERE order_id = ? ORDER BY id');
    $items->execute([$id]);
    $row['items'] = $items->fetchAll();
    $bill = $pdo->prepare('SELECT b.*, p.status AS payment_status, p.method AS payment_method, p.reference AS payment_reference FROM bills b LEFT JOIN payments p ON p.bill_id = b.id WHERE b.order_id = ?');
    $bill->execute([$id]);
    $row['bill'] = $bill->fetch() ?: null;
    return $row;
}

function ensureAvailable(PDO $pdo, int $tableId, string $startAt, string $endAt, ?int $excludeId = null): void
{
    $table = $pdo->prepare('SELECT id FROM restaurant_tables WHERE id = ? AND is_active = 1 FOR UPDATE');
    $table->execute([$tableId]);
    if (!$table->fetch()) {
        fail('That table is not available for booking.', 409);
    }
    $sql = "SELECT id FROM reservations WHERE table_id = ? AND status IN ('pending', 'confirmed') AND start_at < ? AND end_at > ?";
    $params = [$tableId, $endAt, $startAt];
    if ($excludeId !== null) {
        $sql .= ' AND id <> ?';
        $params[] = $excludeId;
    }
    $sql .= ' LIMIT 1 FOR UPDATE';
    $overlap = $pdo->prepare($sql);
    $overlap->execute($params);
    if ($overlap->fetch()) {
        fail('That table already has a booking during this time.', 409);
    }
}

function reservationDate(array $data): array
{
    $start = strtotime((string)($data['start_at'] ?? ''));
    $duration = filter_var($data['duration_minutes'] ?? 120, FILTER_VALIDATE_INT);
    if (!$start || $duration === false || $duration < 30 || $duration > 360) {
        fail('Choose a valid date and a duration between 30 and 360 minutes.');
    }
    if ($start < time() - 60) {
        fail('Reservations must be in the future.');
    }
    return [date('Y-m-d H:i:s', $start), date('Y-m-d H:i:s', $start + $duration * 60)];
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$apiPosition = strpos($uri, '/api/');
$path = $apiPosition === false ? trim($uri, '/') : trim(substr($uri, $apiPosition + 5), '/');
$segments = $path === '' ? [] : explode('/', $path);
$action = $segments[0] ?? '';

try {
    $pdo = database();
    if ($method === 'GET' && $path === 'auth/csrf') {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        respond(['token' => $_SESSION['csrf']]);
    }

    if (in_array($method, ['POST', 'PATCH', 'DELETE'], true)) {
        requireCsrf();
    }

    if ($action === 'auth' && $method === 'POST' && ($segments[1] ?? '') === 'register') {
        $data = body();
        $name = trim((string)($data['name'] ?? ''));
        $email = filter_var(strtolower(trim((string)($data['email'] ?? ''))), FILTER_VALIDATE_EMAIL);
        $password = (string)($data['password'] ?? '');
        if (strlen($name) < 2 || strlen($name) > 120 || !$email || strlen($password) < 8) {
            fail('Enter a name, valid email, and password with at least 8 characters.');
        }
        $insert = $pdo->prepare("INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'customer')");
        try {
            $insert->execute([$name, $email, trim((string)($data['phone'] ?? '')) ?: null, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $error) {
            if ((string)$error->getCode() === '23000') {
                fail('An account with this email already exists.', 409);
            }
            throw $error;
        }
        session_regenerate_id(true);
        $_SESSION['user'] = ['id' => (int)$pdo->lastInsertId(), 'name' => $name, 'email' => $email, 'role' => 'customer'];
        respond($_SESSION['user'], 201);
    }

    if ($action === 'auth' && $method === 'POST' && ($segments[1] ?? '') === 'login') {
        $data = body();
        $email = strtolower(trim((string)($data['email'] ?? '')));
        $query = $pdo->prepare('SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ? LIMIT 1');
        $query->execute([$email]);
        $user = $query->fetch();
        if (!$user || !$user['is_active'] || !password_verify((string)($data['password'] ?? ''), $user['password_hash'])) {
            fail('Email or password is incorrect.', 401);
        }
        session_regenerate_id(true);
        $_SESSION['user'] = ['id' => (int)$user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']];
        respond($_SESSION['user']);
    }

    if ($action === 'auth' && $method === 'GET' && ($segments[1] ?? '') === 'me') {
        $user = currentUser();
        $query = $pdo->prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?');
        $query->execute([$user['id']]);
        respond($query->fetch());
    }

    if ($action === 'auth' && $method === 'POST' && ($segments[1] ?? '') === 'logout') {
        currentUser();
        $_SESSION = [];
        session_destroy();
        respond(['message' => 'Signed out.']);
    }

    if ($action === 'profile' && $method === 'PATCH') {
        $user = currentUser();
        $data = body();
        $name = trim((string)($data['name'] ?? ''));
        $phone = trim((string)($data['phone'] ?? ''));
        if (strlen($name) < 2 || strlen($name) > 120 || strlen($phone) > 30) {
            fail('Enter a valid name and phone number.');
        }
        $query = $pdo->prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?');
        $query->execute([$name, $phone ?: null, $user['id']]);
        $_SESSION['user']['name'] = $name;
        respond(['id' => (int)$user['id'], 'name' => $name, 'phone' => $phone]);
    }

    if ($action === 'menu' && $method === 'GET') {
        $sql = 'SELECT m.id, m.category_id, c.name AS category, m.name, m.description, m.price, m.image_url, m.is_available FROM menu_items m JOIN menu_categories c ON c.id = m.category_id';
        $params = [];
        if (isset($_GET['search']) && trim((string)$_GET['search']) !== '') {
            $sql .= ' WHERE (m.name LIKE ? OR m.description LIKE ?)';
            $like = '%' . trim((string)$_GET['search']) . '%';
            $params = [$like, $like];
        }
        $sql .= ' ORDER BY c.name, m.name';
        $query = $pdo->prepare($sql);
        $query->execute($params);
        respond($query->fetchAll());
    }

    if ($action === 'menu' && $method === 'POST') {
        requireRole(['admin']);
        $data = body();
        $name = trim((string)($data['name'] ?? ''));
        $price = filter_var($data['price'] ?? null, FILTER_VALIDATE_FLOAT);
        $categoryId = filter_var($data['category_id'] ?? null, FILTER_VALIDATE_INT);
        if ($name === '' || strlen($name) > 120 || $price === false || $price < 0 || !$categoryId) {
            fail('Provide a name, valid category, and non-negative price.');
        }
        $insert = $pdo->prepare('INSERT INTO menu_items (category_id, name, description, price, is_available) VALUES (?, ?, ?, ?, ?)');
        $insert->execute([$categoryId, $name, trim((string)($data['description'] ?? '')), $price, !empty($data['is_available']) ? 1 : 0]);
        respond(['id' => (int)$pdo->lastInsertId()], 201);
    }

    if ($action === 'menu' && $method === 'PATCH' && isset($segments[1])) {
        requireRole(['admin']);
        $data = body();
        $name = trim((string)($data['name'] ?? ''));
        $price = filter_var($data['price'] ?? null, FILTER_VALIDATE_FLOAT);
        $categoryId = filter_var($data['category_id'] ?? null, FILTER_VALIDATE_INT);
        if ($name === '' || strlen($name) > 120 || $price === false || $price < 0 || !$categoryId) {
            fail('Provide a name, valid category, and non-negative price.');
        }
        $query = $pdo->prepare('UPDATE menu_items SET name = ?, category_id = ?, description = ?, price = ?, is_available = ? WHERE id = ?');
        $query->execute([$name, $categoryId, trim((string)($data['description'] ?? '')), $price, !empty($data['is_available']) ? 1 : 0, (int)$segments[1]]);
        respond(['updated' => $query->rowCount() > 0]);
    }

    if ($action === 'categories' && $method === 'GET') {
        respond($pdo->query('SELECT id, name, description FROM menu_categories ORDER BY name')->fetchAll());
    }

    if ($action === 'categories' && $method === 'POST') {
        requireRole(['admin']);
        $data = body();
        $name = trim((string)($data['name'] ?? ''));
        if ($name === '' || strlen($name) > 80) {
            fail('Category name is required.');
        }
        $insert = $pdo->prepare('INSERT INTO menu_categories (name, description) VALUES (?, ?)');
        $insert->execute([$name, trim((string)($data['description'] ?? '')) ?: null]);
        respond(['id' => (int)$pdo->lastInsertId(), 'name' => $name], 201);
    }

    if ($action === 'tables' && $method === 'GET') {
        currentUser();
        respond($pdo->query('SELECT id, table_number, capacity, area, is_active FROM restaurant_tables ORDER BY table_number')->fetchAll());
    }

    if ($action === 'availability' && $method === 'GET') {
        currentUser();
        $tableId = filter_var($_GET['table_id'] ?? null, FILTER_VALIDATE_INT);
        $guestCount = filter_var($_GET['guest_count'] ?? null, FILTER_VALIDATE_INT);
        if (!$tableId || $guestCount === false || $guestCount < 1) {
            fail('Choose a table and valid guest count.');
        }
        [$start, $end] = reservationDate([
            'start_at' => $_GET['start_at'] ?? '',
            'duration_minutes' => $_GET['duration_minutes'] ?? 120,
        ]);
        $tableQuery = $pdo->prepare('SELECT id, table_number, capacity, area FROM restaurant_tables WHERE id = ? AND is_active = 1');
        $tableQuery->execute([$tableId]);
        $table = $tableQuery->fetch();
        if (!$table || $guestCount > (int)$table['capacity']) {
            respond(['available' => false, 'reason' => 'This table cannot seat that party.']);
        }
        $overlap = $pdo->prepare("SELECT id FROM reservations WHERE table_id = ? AND status IN ('pending', 'confirmed') AND start_at < ? AND end_at > ? LIMIT 1");
        $overlap->execute([$tableId, $end, $start]);
        $busy = (bool)$overlap->fetch();
        respond([
            'available' => !$busy,
            'reason' => $busy ? 'This table is already booked during that time.' : null,
            'table' => $table,
            'start_at' => $start,
            'end_at' => $end,
        ]);
    }

    if ($action === 'tables' && $method === 'PATCH' && isset($segments[1])) {
        requireRole(['admin', 'reception']);
        $data = body();
        $capacity = filter_var($data['capacity'] ?? null, FILTER_VALIDATE_INT);
        if ($capacity === false || $capacity < 1 || $capacity > 30) {
            fail('Table capacity must be between 1 and 30.');
        }
        $query = $pdo->prepare('UPDATE restaurant_tables SET capacity = ?, is_active = ? WHERE id = ?');
        $query->execute([$capacity, !empty($data['is_active']) ? 1 : 0, (int)$segments[1]]);
        respond(['updated' => $query->rowCount() > 0]);
    }

    if ($action === 'reservations' && $method === 'GET') {
        $user = currentUser();
        $sql = 'SELECT r.*, u.name AS guest_name, u.email, u.phone, t.table_number, t.capacity FROM reservations r JOIN users u ON u.id = r.user_id JOIN restaurant_tables t ON t.id = r.table_id';
        if (!in_array($user['role'], ['admin', 'reception'], true)) {
            $sql .= ' WHERE r.user_id = ?';
            $query = $pdo->prepare($sql . ' ORDER BY r.start_at DESC');
            $query->execute([$user['id']]);
        } else {
            $query = $pdo->query($sql . ' ORDER BY r.start_at DESC');
        }
        respond($query->fetchAll());
    }

    if ($action === 'reservations' && $method === 'POST') {
        $user = currentUser();
        $data = body();
        $tableId = filter_var($data['table_id'] ?? null, FILTER_VALIDATE_INT);
        $guestCount = filter_var($data['guest_count'] ?? null, FILTER_VALIDATE_INT);
        if (!$tableId || $guestCount === false || $guestCount < 1 || $guestCount > 30) {
            fail('Choose a table and valid guest count.');
        }
        [$start, $end] = reservationDate($data);
        $pdo->beginTransaction();
        try {
            ensureAvailable($pdo, $tableId, $start, $end);
            $capacityQuery = $pdo->prepare('SELECT capacity FROM restaurant_tables WHERE id = ?');
            $capacityQuery->execute([$tableId]);
            if ($guestCount > (int)$capacityQuery->fetchColumn()) {
                fail('Guest count exceeds the selected table capacity.');
            }
            $insert = $pdo->prepare('INSERT INTO reservations (user_id, table_id, guest_count, start_at, end_at, notes) VALUES (?, ?, ?, ?, ?, ?)');
            $insert->execute([$user['id'], $tableId, $guestCount, $start, $end, trim((string)($data['notes'] ?? '')) ?: null]);
            $id = (int)$pdo->lastInsertId();
            notifyUser($pdo, (int)$user['id'], 'Reservation requested', 'Your table request is awaiting confirmation.');
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        respond(reservationRow($pdo, $id), 201);
    }

    if ($action === 'reservations' && $method === 'PATCH' && isset($segments[1])) {
        $user = currentUser();
        $id = (int)$segments[1];
        $data = body();
        $reservation = reservationRow($pdo, $id);
        $staff = in_array($user['role'], ['admin', 'reception'], true);
        if (!$staff && (int)$reservation['user_id'] !== (int)$user['id']) {
            fail('Reservation not found.', 404);
        }
        $operation = (string)($data['action'] ?? '');
        if ($operation === 'confirm' && $staff) {
            $query = $pdo->prepare("UPDATE reservations SET status = 'confirmed' WHERE id = ? AND status = 'pending'");
            $query->execute([$id]);
            notifyUser($pdo, (int)$reservation['user_id'], 'Reservation confirmed', 'Your table booking has been confirmed.');
        } elseif ($operation === 'cancel' && ($staff || $reservation['status'] === 'pending' || strtotime($reservation['start_at']) > time())) {
            $query = $pdo->prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'confirmed')");
            $query->execute([$id]);
            notifyUser($pdo, (int)$reservation['user_id'], 'Reservation cancelled', 'Your table booking was cancelled.');
        } elseif ($operation === 'reschedule' && !$staff) {
            if ($reservation['status'] !== 'pending' && $reservation['status'] !== 'confirmed') fail('This reservation can no longer be changed.', 409);
            $tableId = filter_var($data['table_id'] ?? $reservation['table_id'], FILTER_VALIDATE_INT);
            [$start, $end] = reservationDate($data);
            $pdo->beginTransaction();
            try {
                ensureAvailable($pdo, (int)$tableId, $start, $end, $id);
                $capacityQuery = $pdo->prepare('SELECT capacity FROM restaurant_tables WHERE id = ?');
                $capacityQuery->execute([$tableId]);
                if ((int)$reservation['guest_count'] > (int)$capacityQuery->fetchColumn()) {
                    fail('Guest count exceeds the selected table capacity.');
                }
                $query = $pdo->prepare('UPDATE reservations SET table_id = ?, start_at = ?, end_at = ? WHERE id = ?');
                $query->execute([$tableId, $start, $end, $id]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
        } else {
            fail('That reservation action is not allowed.', 403);
        }
        respond(reservationRow($pdo, $id));
    }

    if ($action === 'orders' && $method === 'GET') {
        $user = currentUser();
        if (in_array($user['role'], ['admin', 'reception', 'kitchen'], true)) {
            $ids = $pdo->query('SELECT id FROM orders ORDER BY created_at DESC')->fetchAll(PDO::FETCH_COLUMN);
        } else {
            $query = $pdo->prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC');
            $query->execute([$user['id']]);
            $ids = $query->fetchAll(PDO::FETCH_COLUMN);
        }
        respond(array_map(fn($id) => orderRow($pdo, (int)$id), $ids));
    }

    if ($action === 'orders' && $method === 'POST') {
        $user = currentUser();
        $data = body();
        $reservationId = isset($data['reservation_id']) ? (int)$data['reservation_id'] : null;
        $ownerId = $user['role'] === 'customer' ? (int)$user['id'] : null;
        if ($user['role'] === 'reception' && !empty($data['customer_id'])) {
            $customerQuery = $pdo->prepare("SELECT id FROM users WHERE id = ? AND role = 'customer' AND is_active = 1");
            $customerQuery->execute([(int)$data['customer_id']]);
            $ownerId = $customerQuery->fetchColumn();
            if (!$ownerId) fail('Customer account not found.', 404);
            $ownerId = (int)$ownerId;
        }
        if ($user['role'] === 'customer') {
            if (!$reservationId) fail('A confirmed reservation is required for a pre-order.');
            $reservationQuery = $pdo->prepare("SELECT id FROM reservations WHERE id = ? AND user_id = ? AND status = 'confirmed'");
            $reservationQuery->execute([$reservationId, $user['id']]);
            if (!$reservationQuery->fetch()) fail('Choose one of your confirmed reservations.', 403);
        } elseif ($user['role'] === 'reception' && $reservationId) {
            $reservationQuery = $pdo->prepare('SELECT user_id FROM reservations WHERE id = ?');
            $reservationQuery->execute([$reservationId]);
            $reservationOwner = $reservationQuery->fetchColumn();
            if (!$reservationOwner) fail('Reservation not found.', 404);
            $ownerId = (int)$reservationOwner;
        } elseif (!in_array($user['role'], ['reception', 'admin', 'customer'], true)) {
            fail('You do not have permission to create orders.', 403);
        }
        $items = $data['items'] ?? [];
        if (!is_array($items) || count($items) < 1 || count($items) > 30) fail('Add between 1 and 30 menu items.');
        $pdo->beginTransaction();
        try {
            $insertOrder = $pdo->prepare('INSERT INTO orders (user_id, reservation_id, created_by, notes) VALUES (?, ?, ?, ?)');
            $insertOrder->execute([$ownerId ?: null, $reservationId, $user['id'], trim((string)($data['notes'] ?? '')) ?: null]);
            $orderId = (int)$pdo->lastInsertId();
            $findItem = $pdo->prepare('SELECT id, name, price FROM menu_items WHERE id = ? AND is_available = 1');
            $addItem = $pdo->prepare('INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?)');
            foreach ($items as $item) {
                $menuId = filter_var($item['menu_item_id'] ?? null, FILTER_VALIDATE_INT);
                $quantity = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT);
                if (!$menuId || $quantity === false || $quantity < 1 || $quantity > 50) fail('Order item or quantity is invalid.');
                $findItem->execute([$menuId]);
                $menu = $findItem->fetch();
                if (!$menu) fail('A selected menu item is no longer available.', 409);
                $price = (float)$menu['price'];
                $addItem->execute([$orderId, $menuId, $menu['name'], $price, $quantity, round($price * $quantity, 2)]);
            }
            $history = $pdo->prepare('INSERT INTO order_status_history (order_id, changed_by, status) VALUES (?, ?, \'placed\')');
            $history->execute([$orderId, $user['id']]);
            if ($ownerId !== null && $ownerId !== (int)$user['id']) notifyUser($pdo, $ownerId, 'Order placed', 'A new order has been placed for your table.');
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        respond(orderRow($pdo, $orderId), 201);
    }

    if ($action === 'orders' && $method === 'PATCH' && isset($segments[1])) {
        $user = requireRole(['kitchen', 'reception', 'admin']);
        $data = body();
        $id = (int)$segments[1];
        $status = (string)($data['status'] ?? '');
        $allowed = ['placed', 'preparing', 'ready', 'served', 'cancelled'];
        if (!in_array($status, $allowed, true)) fail('Unknown order status.');
        $existing = orderRow($pdo, $id);
        $transitions = ['placed' => ['preparing', 'cancelled'], 'preparing' => ['ready', 'cancelled'], 'ready' => ['served'], 'served' => [], 'cancelled' => []];
        if (!in_array($status, $transitions[$existing['status']], true)) fail('That status change is not allowed.', 409);
        $pdo->beginTransaction();
        try {
            $update = $pdo->prepare('UPDATE orders SET status = ? WHERE id = ?');
            $update->execute([$status, $id]);
            $history = $pdo->prepare('INSERT INTO order_status_history (order_id, changed_by, status) VALUES (?, ?, ?)');
            $history->execute([$id, $user['id'], $status]);
            if ($existing['user_id']) notifyUser($pdo, (int)$existing['user_id'], 'Order ' . ucfirst($status), 'Your order status is now ' . $status . '.');
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        respond(orderRow($pdo, $id));
    }

    if ($action === 'bills' && $method === 'POST') {
        $user = requireRole(['admin', 'reception']);
        $orderId = filter_var(body()['order_id'] ?? null, FILTER_VALIDATE_INT);
        if (!$orderId) fail('Order id is required.');
        $pdo->beginTransaction();
        try {
            $lock = $pdo->prepare('SELECT id FROM orders WHERE id = ? FOR UPDATE');
            $lock->execute([$orderId]);
            if (!$lock->fetch()) fail('Order not found.', 404);
            $sum = $pdo->prepare('SELECT COALESCE(SUM(line_total), 0) FROM order_items WHERE order_id = ?');
            $sum->execute([$orderId]);
            $subtotal = (float)$sum->fetchColumn();
            $insert = $pdo->prepare('INSERT INTO bills (order_id, subtotal, tax, total, created_by) VALUES (?, ?, 0, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)');
            $insert->execute([$orderId, $subtotal, $subtotal, $user['id']]);
            $billId = (int)$pdo->lastInsertId();
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        $query = $pdo->prepare('SELECT * FROM bills WHERE id = ?');
        $query->execute([$billId]);
        respond($query->fetch(), 201);
    }

    if ($action === 'payments' && $method === 'POST') {
        $user = currentUser();
        $data = body();
        $orderId = filter_var($data['order_id'] ?? null, FILTER_VALIDATE_INT);
        $key = trim((string)($data['idempotency_key'] ?? ''));
        $methodName = (string)($data['method'] ?? 'simulated');
        if (!$orderId || strlen($key) < 8 || strlen($key) > 80 || !in_array($methodName, ['cash', 'card', 'upi', 'simulated'], true)) fail('Payment details are invalid.');
        $pdo->beginTransaction();
        try {
            $lock = $pdo->prepare('SELECT o.id, o.user_id, b.id AS bill_id, b.total FROM orders o JOIN bills b ON b.order_id = o.id WHERE o.id = ? FOR UPDATE');
            $lock->execute([$orderId]);
            $bill = $lock->fetch();
            if (!$bill) fail('Create the bill before recording payment.', 409);
            if (!in_array($user['role'], ['reception', 'admin'], true) && (int)$bill['user_id'] !== (int)$user['id']) fail('Order not found.', 404);
            $existing = $pdo->prepare('SELECT * FROM payments WHERE bill_id = ? OR idempotency_key = ? LIMIT 1');
            $existing->execute([$bill['bill_id'], $key]);
            $payment = $existing->fetch();
            if ($payment) {
                if ((int)$payment['bill_id'] !== (int)$bill['bill_id'] || $payment['idempotency_key'] !== $key) fail('This bill has already been paid.', 409);
                $pdo->commit();
                respond($payment);
            }
            $reference = 'SIM-' . strtoupper(bin2hex(random_bytes(5)));
            $insert = $pdo->prepare('INSERT INTO payments (bill_id, idempotency_key, amount, method, reference) VALUES (?, ?, ?, ?, ?)');
            $insert->execute([$bill['bill_id'], $key, $bill['total'], $methodName, $reference]);
            $paymentId = (int)$pdo->lastInsertId();
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        $query = $pdo->prepare('SELECT * FROM payments WHERE id = ?');
        $query->execute([$paymentId]);
        respond($query->fetch(), 201);
    }

    if ($action === 'notifications' && $method === 'GET') {
        $user = currentUser();
        $query = $pdo->prepare('SELECT id, title, message, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100');
        $query->execute([$user['id']]);
        respond($query->fetchAll());
    }

    if ($action === 'notifications' && $method === 'PATCH' && isset($segments[1])) {
        $user = currentUser();
        $query = $pdo->prepare('UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?');
        $query->execute([(int)$segments[1], $user['id']]);
        respond(['updated' => $query->rowCount() > 0]);
    }

    if ($action === 'admin') {
        requireRole(['admin']);
        if (($segments[1] ?? '') === 'dashboard' && $method === 'GET') {
            $stats = [
                'customers' => (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'customer' AND is_active = 1")->fetchColumn(),
                'today_reservations' => (int)$pdo->query('SELECT COUNT(*) FROM reservations WHERE DATE(start_at) = CURDATE()')->fetchColumn(),
                'active_orders' => (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE status IN ('placed','preparing','ready')")->fetchColumn(),
                'today_revenue' => (float)$pdo->query('SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE DATE(p.paid_at) = CURDATE() AND p.status = \'paid\'')->fetchColumn(),
                'tables' => $pdo->query('SELECT id, table_number, capacity, area, is_active FROM restaurant_tables ORDER BY table_number')->fetchAll(),
            ];
            respond($stats);
        }
        if (($segments[1] ?? '') === 'users' && $method === 'GET') {
            respond($pdo->query('SELECT id, name, email, phone, role, is_active, created_at FROM users ORDER BY created_at DESC')->fetchAll());
        }
        if (($segments[1] ?? '') === 'users' && $method === 'PATCH' && isset($segments[2])) {
            $data = body();
            $role = (string)($data['role'] ?? '');
            if (!in_array($role, ['customer', 'reception', 'kitchen', 'admin'], true)) fail('Choose a valid role.');
            if ((int)$segments[2] === (int)currentUser()['id'] && ($role !== 'admin' || empty($data['is_active']))) fail('You cannot remove your own administrator access.', 409);
            $query = $pdo->prepare('UPDATE users SET role = ?, is_active = ? WHERE id = ?');
            $query->execute([$role, !empty($data['is_active']) ? 1 : 0, (int)$segments[2]]);
            respond(['updated' => $query->rowCount() > 0]);
        }
        if (($segments[1] ?? '') === 'reports' && $method === 'GET') {
            $period = (string)($_GET['period'] ?? 'daily');
            $daily = $pdo->query("SELECT DATE(paid_at) AS label, SUM(amount) AS revenue, COUNT(*) AS payments FROM payments WHERE status = 'paid' AND paid_at >= CURDATE() - INTERVAL 29 DAY GROUP BY DATE(paid_at) ORDER BY label DESC")->fetchAll();
            $monthly = $pdo->query("SELECT DATE_FORMAT(paid_at, '%Y-%m') AS label, SUM(amount) AS revenue, COUNT(*) AS payments FROM payments WHERE status = 'paid' AND paid_at >= CURDATE() - INTERVAL 11 MONTH GROUP BY DATE_FORMAT(paid_at, '%Y-%m') ORDER BY label DESC")->fetchAll();
            $popular = $pdo->query('SELECT item_name, SUM(quantity) AS quantity, SUM(line_total) AS revenue FROM order_items GROUP BY menu_item_id, item_name ORDER BY quantity DESC LIMIT 10')->fetchAll();
            $peak = $pdo->query('SELECT HOUR(created_at) AS hour, COUNT(*) AS orders FROM orders GROUP BY HOUR(created_at) ORDER BY orders DESC LIMIT 8')->fetchAll();
            respond(['period' => $period, 'daily' => $daily, 'monthly' => $monthly, 'popular_items' => $popular, 'peak_hours' => $peak]);
        }
    }

    fail('API endpoint not found.', 404);
} catch (PDOException $error) {
    if (str_starts_with((string)$error->getCode(), '23')) fail('The request conflicts with existing data.', 409);
    error_log($error->getMessage());
    fail('A database error occurred.', 500);
} catch (Throwable $error) {
    error_log($error->getMessage());
    fail('The request could not be completed.', 500);
}
