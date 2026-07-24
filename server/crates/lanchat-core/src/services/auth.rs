//! 认证服务

use sqlx::PgPool;
use lanchat_common::auth;
use lanchat_common::error::ApiError;
use crate::models::User;
use crate::repository;

/// 中国大陆手机号正则
const PHONE_REGEX: &str = r"^1[3-9]\d{9}$";

/// 登录请求
#[derive(Debug, serde::Deserialize)]
pub struct LoginRequest {
    pub account: String,
    pub password: String,
}

/// 注册请求
/// 字段映射：account（账户）对应原 username；name（姓名）对应原 display_name
#[derive(Debug, serde::Deserialize)]
pub struct RegisterRequest {
    pub account: String,
    pub password: String,
    pub name: String,
    pub department: String,
    pub role: String,
}

/// 登录/注册响应
#[derive(Debug, serde::Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
}

/// 校验账户是否为手机号格式
fn validate_phone(account: &str) -> Result<(), ApiError> {
    let re = regex::Regex::new(PHONE_REGEX)
        .map_err(|e| ApiError::InternalError(format!("手机号正则编译失败: {}", e)))?;
    if !re.is_match(account) {
        return Err(ApiError::ValidationError("账户必须是有效的11位手机号".to_string()));
    }
    Ok(())
}

/// 超级管理员账户名
const SUPER_ADMIN_ACCOUNT: &str = "admin";

/// 校验注册必填字段
fn validate_register_req(req: &RegisterRequest) -> Result<(), ApiError> {
    // 超级管理员账户跳过手机号校验
    if req.account != SUPER_ADMIN_ACCOUNT {
        validate_phone(&req.account)?;
    }

    if req.password.trim().is_empty() || req.password.len() < 6 {
        return Err(ApiError::ValidationError("密码至少6位".to_string()));
    }
    if req.name.trim().is_empty() {
        return Err(ApiError::ValidationError("姓名不能为空".to_string()));
    }
    if req.department.trim().is_empty() {
        return Err(ApiError::ValidationError("部门不能为空".to_string()));
    }
    if req.role != "user" && req.role != "admin" {
        return Err(ApiError::ValidationError("角色无效".to_string()));
    }
    Ok(())
}

/// 用户登录
pub async fn login(
    pool: &PgPool,
    account: &str,
    password: &str,
    jwt_secret: &str,
) -> Result<AuthResponse, ApiError> {
    // 查找用户
    let user = repository::user_repository::find_by_account(pool, account)
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
    req: &RegisterRequest,
    jwt_secret: &str,
) -> Result<AuthResponse, ApiError> {
    validate_register_req(req)?;

    // 检查账户是否已存在
    if repository::user_repository::find_by_account(pool, &req.account)
        .await?
        .is_some()
    {
        return Err(ApiError::ValidationError("该手机号已注册".to_string()));
    }

    // 哈希密码
    let password_hash = auth::hash_password(&req.password)?;

    // 创建用户
    let user = repository::user_repository::create_user(
        pool,
        &req.account,
        &password_hash,
        &req.name,
        &req.department,
        &req.role,
    ).await?;

    // 新用户自动加入系统默认群组（公司大群）
    let _ = crate::services::group::join_system_group(pool, &user.id).await;

    // 生成 Token
    let token = auth::generate_token(&user.id.to_string(), &user.role, jwt_secret)?;

    Ok(AuthResponse { token, user })
}
