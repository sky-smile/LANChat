//! 错误类型定义

use thiserror::Error;

/// 认证错误
#[derive(Error, Debug)]
pub enum AuthError {
    #[error("密码哈希失败: {0}")]
    HashError(String),
    #[error("Token 错误: {0}")]
    TokenError(String),
    #[error("无效的凭据")]
    InvalidCredentials,
    #[error("未授权")]
    Unauthorized,
    #[error("权限不足")]
    Forbidden,
}

/// API 错误
#[derive(Error, Debug)]
pub enum ApiError {
    #[error("未找到: {0}")]
    NotFound(String),
    #[error("验证失败: {0}")]
    ValidationError(String),
    #[error("数据库错误: {0}")]
    DatabaseError(#[from] sqlx::Error),
    #[error("认证错误: {0}")]
    AuthError(#[from] AuthError),
    #[error("内部错误: {0}")]
    InternalError(String),
}
