//! 管理员权限中间件

use axum::extract::State;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use lanchat_common::error::{ApiError, AuthError};
use uuid::Uuid;

use crate::error::AppError;

/// 管理员权限中间件
/// 需要在 auth_middleware 之后使用，因为需要 user_id
pub async fn admin_middleware(
    State(state): State<crate::AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    // 从 request extensions 中获取 user_id (由 auth_middleware 设置)
    let user_id = request
        .extensions()
        .get::<String>()
        .cloned()
        .ok_or(AppError(ApiError::AuthError(AuthError::Unauthorized)))?;

    let uid = Uuid::parse_str(&user_id).map_err(|e| {
        AppError(ApiError::AuthError(AuthError::TokenError(e.to_string())))
    })?;

    // 查询用户角色
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or(AppError(ApiError::NotFound("用户不存在".to_string())))?;

    // 检查是否为管理员
    if user.role != "admin" {
        return Err(AppError(ApiError::AuthError(AuthError::Forbidden)));
    }

    Ok(next.run(request).await)
}
