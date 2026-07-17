//! 认证服务

use sqlx::PgPool;
use lanchat_common::auth;
use lanchat_common::error::ApiError;
use crate::models::User;
use crate::repository;

/// 登录请求
#[derive(Debug, serde::Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// 注册请求
#[derive(Debug, serde::Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
    pub display_name: Option<String>,
}

/// 登录/注册响应
#[derive(Debug, serde::Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

/// 用户登录
pub async fn login(
    pool: &PgPool,
    username: &str,
    password: &str,
    jwt_secret: &str,
) -> Result<AuthResponse, ApiError> {
    // 查找用户
    let user = repository::user_repository::find_by_username(pool, username)
        .await?
        .ok_or(ApiError::AuthError(lanchat_common::error::AuthError::InvalidCredentials))?;

    // 验证密码
    if !auth::verify_password(password, &user.password_hash) {
        return Err(ApiError::AuthError(lanchat_common::error::AuthError::InvalidCredentials));
    }

    // 生成 Token
    let token = auth::generate_token(&user.id.to_string(), &user.role, jwt_secret)?;

    Ok(AuthResponse { token, user })
}

/// 用户注册
pub async fn register(
    pool: &PgPool,
    username: &str,
    password: &str,
    display_name: Option<&str>,
    jwt_secret: &str,
) -> Result<AuthResponse, ApiError> {
    // 检查用户名是否已存在
    if repository::user_repository::find_by_username(pool, username)
        .await?
        .is_some()
    {
        return Err(ApiError::ValidationError("用户名已存在".to_string()));
    }

    // 哈希密码
    let password_hash = auth::hash_password(password)?;

    // 创建用户
    let user = repository::user_repository::create_user(pool, username, &password_hash, display_name).await?;

    // 生成 Token
    let token = auth::generate_token(&user.id.to_string(), &user.role, jwt_secret)?;

    Ok(AuthResponse { token, user })
}
