//! 认证服务

use lanchat_common::auth;
use crate::models::User;

/// 登录请求
#[derive(Debug, serde::Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// 登录响应
#[derive(Debug, serde::Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user: User,
}

/// 验证用户密码
pub fn verify_password(password: &str, hash: &str) -> bool {
    auth::verify_password(password, hash)
}

/// 生成 JWT Token
pub fn generate_token(user_id: &str, secret: &str) -> Result<String, lanchat_common::error::AuthError> {
    auth::generate_token(user_id, secret)
}
