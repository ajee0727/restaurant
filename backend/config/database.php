<?php
declare(strict_types=1);

function database(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = getenv('RESTAURANT_DB_HOST') ?: '127.0.0.1';
    $name = getenv('RESTAURANT_DB_NAME') ?: 'restaurant';
    $user = getenv('RESTAURANT_DB_USER') ?: 'root';
    $password = getenv('RESTAURANT_DB_PASSWORD') ?: '';
    $dsn = "mysql:host={$host};dbname={$name};charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}
