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
            "SELECT id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at \
             FROM users WHERE account ILIKE $1 OR name ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3"
        )
        .bind(&pattern)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

        let (total,): (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM users WHERE account ILIKE $1 OR name ILIKE $1"
        )
        .bind(&pattern)
        .fetch_one(&state.db)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

        (users, total)
    } else {
        let users = sqlx::query_as::<_, User>(
            "SELECT id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at \
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
/// 字段映射：account（账户/手机号）对应原 username；name（姓名）对应原 display_name
#[derive(serde::Deserialize)]
struct CreateUserRequest {
    account: String,
    password: String,
    name: String,
    department: String,
    role: String,
}

/// 校验创建/编辑用户必填字段
fn validate_user_fields(account: &str, password: &str, name: &str, department: &str, role: &str) -> Result<(), ApiError> {
    // 超级管理员账户跳过手机号校验
    if account != PROTECTED_ADMIN {
        let re = regex::Regex::new(r"^1[3-9]\d{9}$")
            .map_err(|e| ApiError::InternalError(format!("手机号正则编译失败: {}", e)))?;
        if !re.is_match(account) {
            return Err(ApiError::ValidationError("账户必须是有效的11位手机号".to_string()));
        }
    }
    if password.len() < 6 {
        return Err(ApiError::ValidationError("密码至少6位".to_string()));
    }
    if name.trim().is_empty() {
        return Err(ApiError::ValidationError("姓名不能为空".to_string()));
    }
    if department.trim().is_empty() {
        return Err(ApiError::ValidationError("部门不能为空".to_string()));
    }
    if role != "user" && role != "admin" {
        return Err(ApiError::ValidationError("角色无效".to_string()));
    }
    Ok(())
}

/// 创建用户
async fn create_user(
    State(state): State<AppState>,
    Json(req): Json<CreateUserRequest>,
) -> Result<(StatusCode, Json<ApiResponse<User>>), AppError> {
    validate_user_fields(&req.account, &req.password, &req.name, &req.department, &req.role)?;

    // 检查账户是否已存在
    if lanchat_core::repository::user_repository::find_by_account(&state.db, &req.account)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .is_some()
    {
        return Err(AppError(ApiError::ValidationError("该手机号已注册".to_string())));
    }

    // 哈希密码
    let password_hash = lanchat_common::auth::hash_password(&req.password)?;

    // 创建用户
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (account, password_hash, name, department, role) \
         VALUES ($1, $2, $3, $4, $5) \
         RETURNING id, account, password_hash, name, avatar_url, department, role, status, last_seen_at, created_at, updated_at"
    )
    .bind(&req.account)
    .bind(&password_hash)
    .bind(&req.name)
    .bind(&req.department)
    .bind(&req.role)
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
/// 字段映射：account（账户/手机号）对应原 username；name（姓名）对应原 display_name
#[derive(serde::Deserialize)]
struct UpdateUserRequest {
    account: Option<String>,
    name: Option<String>,
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
    if existing.account == PROTECTED_ADMIN && req.role.is_some() && req.role.as_deref() != Some("admin") {
        return Err(AppError(ApiError::ValidationError("超级管理员角色不可修改".to_string())));
    }

    // 若修改账户，校验格式并检查唯一性（超级管理员跳过手机号校验）
    if let Some(ref account) = req.account {
        if account != PROTECTED_ADMIN {
            let re = regex::Regex::new(r"^1[3-9]\d{9}$")
                .map_err(|e| AppError(ApiError::InternalError(format!("手机号正则编译失败: {}", e))))?;
            if !re.is_match(account) {
                return Err(AppError(ApiError::ValidationError("账户必须是有效的11位手机号".to_string())));
            }
        }
        if account != &existing.account {
            if lanchat_core::repository::user_repository::find_by_account(&state.db, account)
                .await
                .map_err(|e| AppError(ApiError::DatabaseError(e)))?
                .is_some()
            {
                return Err(AppError(ApiError::ValidationError("该手机号已注册".to_string())));
            }
        }
    }

    // 字段非空校验（传值时）
    if let Some(ref name) = req.name {
        if name.trim().is_empty() {
            return Err(AppError(ApiError::ValidationError("姓名不能为空".to_string())));
        }
    }
    if let Some(ref department) = req.department {
        if department.trim().is_empty() {
            return Err(AppError(ApiError::ValidationError("部门不能为空".to_string())));
        }
    }
    if let Some(ref role) = req.role {
        if role != "user" && role != "admin" {
            return Err(AppError(ApiError::ValidationError("角色无效".to_string())));
        }
    }

    let user = lanchat_core::repository::user_repository::update_user(
        &state.db,
        &user_id,
        req.account.as_deref(),
        req.name.as_deref(),
        req.department.as_deref(),
        req.role.as_deref(),
    )
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?
    .ok_or(AppError(ApiError::NotFound("用户不存在".to_string())))?;

    Ok(Json(ApiResponse::success(user)))
}

/// 受保护的超级管理员账户
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

    if user.account == PROTECTED_ADMIN {
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
