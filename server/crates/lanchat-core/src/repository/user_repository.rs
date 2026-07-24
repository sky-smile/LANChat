//! 用户数据访问

use sqlx::PgPool;
use uuid::Uuid;

use crate::models::User;

/// 字段映射：account（账户/手机号）对应原 username；name（姓名）对应原 display_name

/// 按账户查找用户
pub async fn find_by_account(pool: &PgPool, account: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at FROM users WHERE account = $1"
    )
    .bind(account)
    .fetch_optional(pool)
    .await
}

/// 创建用户
pub async fn create_user(
    pool: &PgPool,
    account: &str,
    password_hash: &str,
    name: &str,
    department: &str,
    role: &str,
) -> Result<User, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "INSERT INTO users (account, password_hash, name, department, role) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at"
    )
    .bind(account)
    .bind(password_hash)
    .bind(name)
    .bind(department)
    .bind(role)
    .fetch_one(pool)
    .await
}

/// 按 ID 查找用户
pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at FROM users WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// 搜索用户（按账户或姓名模糊匹配，排除指定用户）
pub async fn search_users(pool: &PgPool, query: &str, exclude_id: &Uuid, limit: i64) -> Result<Vec<User>, sqlx::Error> {
    let pattern = format!("%{}%", query);
    sqlx::query_as::<_, User>(
        "SELECT id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at \
         FROM users WHERE id != $1 AND (account ILIKE $2 OR name ILIKE $2) ORDER BY account LIMIT $3"
    )
    .bind(exclude_id)
    .bind(&pattern)
    .bind(limit)
    .fetch_all(pool)
    .await
}

/// 获取所有用户（排除指定用户，用于联系人列表）
pub async fn get_all_users(pool: &PgPool, exclude_id: &Uuid, limit: i64) -> Result<Vec<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at \
         FROM users WHERE id != $1 ORDER BY account LIMIT $2"
    )
    .bind(exclude_id)
    .bind(limit)
    .fetch_all(pool)
    .await
}

/// 更新用户在线状态
pub async fn set_user_status(
    pool: &PgPool,
    user_id: &Uuid,
    status: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET status = $1, last_seen_at = NOW() WHERE id = $2")
        .bind(status)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 更新用户资料
pub async fn update_profile(
    pool: &PgPool,
    user_id: &Uuid,
    name: &str,
    department: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "UPDATE users SET name = $1, department = $2, updated_at = NOW() WHERE id = $3 \
         RETURNING id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at",
    )
    .bind(name)
    .bind(department)
    .bind(user_id)
    .fetch_optional(pool)
    .await
}

/// 管理员更新用户（可修改账户、姓名、部门、角色）
pub async fn update_user(
    pool: &PgPool,
    user_id: &Uuid,
    account: Option<&str>,
    name: Option<&str>,
    department: Option<&str>,
    role: Option<&str>,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "UPDATE users \
         SET account = COALESCE($2, account), \
             name = COALESCE($3, name), \
             department = COALESCE($4, department), \
             role = COALESCE($5, role), \
             updated_at = NOW() \
         WHERE id = $1 \
         RETURNING id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at"
    )
    .bind(user_id)
    .bind(account)
    .bind(name)
    .bind(department)
    .bind(role)
    .fetch_optional(pool)
    .await
}
