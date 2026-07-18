//! 管理员路由 - 用户管理

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use axum::routing::{get, post};
use axum::Router;
use lanchat_common::error::ApiError;
use lanchat_common::types::ApiResponse;
use lanchat_core::models::User;
use uuid::Uuid;

use crate::error::AppError;
use crate::AppState;

/// 管理员路由（需要 admin 权限）
pub fn admin_routes() -> Router<AppState> {
    Router::new()
        .route("/users", get(list_users).post(create_user))
        .route("/users/:user_id", get(get_user).put(update_user).delete(delete_user))
        .route("/users/:user_id/reset-password", post(reset_password))
}

/// 用户列表查询参数
#[derive(serde::Deserialize)]
struct ListUsersQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    search: Option<String>,
}

/// 用户列表响应
#[derive(serde::Serialize)]
struct UserListResponse {
    users: Vec<User>,
    total: i64,
    page: i64,
    page_size: i64,
}

/// 获取用户列表
async fn list_users(
    State(state): State<AppState>,
    Query(query): Query<ListUsersQuery>,
) -> Result<Json<ApiResponse<UserListResponse>>, AppError> {
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).min(100);
    let offset = (page - 1) * page_size;

    let (users, total) = if let Some(search) = &query.search {
        let pattern = format!("%{}%", search);
        let users = sqlx::query_as::<_, User>(
            "SELECT id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at \
             FROM users WHERE username ILIKE $1 OR display_name ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3"
        )
        .bind(&pattern)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

        let (total,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM users WHERE username ILIKE $1 OR display_name ILIKE $1"
        )
        .bind(&pattern)
        .fetch_one(&state.db)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

        (users, total)
    } else {
        let users = sqlx::query_as::<_, User>(
            "SELECT id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at \
             FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2"
        )
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

        let (total,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&state.db)
            .await
            .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

        (users, total)
    };

    Ok(Json(ApiResponse::success(UserListResponse {
        users,
        total,
        page,
        page_size,
    })))
}

/// 创建用户请求
#[derive(serde::Deserialize)]
struct CreateUserRequest {
    username: String,
    password: String,
    display_name: Option<String>,
    department: Option<String>,
    role: Option<String>,
}

/// 将空字符串转换为 None
fn empty_to_none(opt: Option<String>) -> Option<String> {
    opt.filter(|s| !s.trim().is_empty())
}

/// 创建用户
async fn create_user(
    State(state): State<AppState>,
    Json(req): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<ApiResponse<User>>), AppError> {
    // 检查用户名是否已存在
    if lanchat_core::repository::user_repository::find_by_username(&state.db, &req.username)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .is_some()
    {
        return Err(AppError(ApiError::ValidationError("用户名已存在".to_string())));
    }

    // 哈希密码
    let password_hash = lanchat_common::auth::hash_password(&req.password)?;

    // 空字符串转为 None
    let display_name = empty_to_none(req.display_name);
    let department = empty_to_none(req.department);

    // 创建用户
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, password_hash, display_name, department, role) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at"
    )
    .bind(&req.username)
    .bind(&password_hash)
    .bind(&display_name)
    .bind(&department)
    .bind(req.role.unwrap_or_else(|| "user".to_string()))
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok((StatusCode::CREATED, Json(ApiResponse::success(user))))
}

/// 获取单个用户
async fn get_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<ApiResponse<User>>, AppError> {
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &user_id)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or(AppError(ApiError::NotFound("用户不存在".to_string())))?;

    Ok(Json(ApiResponse::success(user)))
}

/// 更新用户请求
#[derive(serde::Deserialize)]
struct UpdateUserRequest {
    display_name: Option<String>,
    department: Option<String>,
    role: Option<String>,
}

/// 更新用户
async fn update_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<ApiResponse<User>>, AppError> {
    // 先查询用户，检查是否为受保护的超级管理员
    let existing = lanchat_core::repository::user_repository::find_by_id(&state.db, &user_id)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or(AppError(ApiError::NotFound("用户不存在".to_string())))?;

    // 超级管理员的角色不可修改
    if existing.username == PROTECTED_ADMIN && req.role.is_some() && req.role.as_deref() != Some("admin") {
        return Err(AppError(ApiError::ValidationError("超级管理员角色不可修改".to_string())));
    }

    // 空字符串转为 None
    let display_name = empty_to_none(req.display_name);
    let department = empty_to_none(req.department);

    let user = sqlx::query_as::<_, User>(
        "UPDATE users SET display_name = COALESCE($2, display_name), \
         department = COALESCE($3, department), role = COALESCE($4, role), \
         updated_at = NOW() WHERE id = $1 \
         RETURNING id, username, password_hash, display_name, avatar_url, department, role, status, last_seen_at, created_at, updated_at"
    )
    .bind(user_id)
    .bind(&display_name)
    .bind(&department)
    .bind(&req.role)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?
    .ok_or(AppError(ApiError::NotFound("用户不存在".to_string())))?;

    Ok(Json(ApiResponse::success(user)))
}

/// 受保护的超级管理员用户名
const PROTECTED_ADMIN: &str = "admin";

/// 删除用户
async fn delete_user(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    // 先查询用户，检查是否为受保护的超级管理员
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &user_id)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or(AppError(ApiError::NotFound("用户不存在".to_string())))?;

    if user.username == PROTECTED_ADMIN {
        return Err(AppError(ApiError::ValidationError("超级管理员账户不可删除".to_string())));
    }

    let result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    if result.rows_affected() == 0 {
        return Err(AppError(ApiError::NotFound("用户不存在".to_string())));
    }

    Ok(Json(ApiResponse::success(())))
}

/// 重置密码请求
#[derive(serde::Deserialize)]
struct ResetPasswordRequest {
    new_password: String,
}

/// 重置用户密码
async fn reset_password(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<ResetPasswordRequest>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let password_hash = lanchat_common::auth::hash_password(&req.new_password)?;

    let result = sqlx::query("UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1")
        .bind(user_id)
        .bind(&password_hash)
        .execute(&state.db)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    if result.rows_affected() == 0 {
        return Err(AppError(ApiError::NotFound("用户不存在".to_string())));
    }

    Ok(Json(ApiResponse::success(())))
}
