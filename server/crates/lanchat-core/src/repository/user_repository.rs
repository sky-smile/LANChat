//! 用户数据访问

use sqlx::PgPool;
use uuid::Uuid;

use crate::models::User;

/// 按用户名查找用户
pub async fn find_by_username(pool: &PgPool, username: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at FROM users WHERE username = $1"
    )
    .bind(username)
    .fetch_optional(pool)
    .await
}

/// 创建用户
pub async fn create_user(
    pool: &PgPool,
    username: &str,
    password_hash: &str,
    display_name: Option<&str>,
) -> Result<User, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at"
    )
    .bind(username)
    .bind(password_hash)
    .bind(display_name)
    .fetch_one(pool)
    .await
}

/// 按 ID 查找用户
pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at FROM users WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// 搜索用户（按用户名或显示名模糊匹配，排除指定用户）
pub async fn search_users(pool: &PgPool, query: &str, exclude_id: &Uuid, limit: i64) -> Result<Vec<User>, sqlx::Error> {
    let pattern = format!("%{}%", query);
    sqlx::query_as::<_, User>(
        "SELECT id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at \
         FROM users WHERE id != $1 AND (username ILIKE $2 OR display_name ILIKE $2) ORDER BY username LIMIT $3"
    )
    .bind(exclude_id)
    .bind(&pattern)
    .bind(limit)
    .fetch_all(pool)
    .await
}
