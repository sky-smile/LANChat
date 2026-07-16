//! JWT 认证中间件

use axum::extract::State;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use lanchat_common::auth::verify_token;
use lanchat_common::error::{ApiError, AuthError};

use crate::error::AppError;

/// 从请求中提取 Bearer Token
fn extract_token(request: &Request<axum::body::Body>) -> Option<String> {
    let auth_header = request.headers().get("authorization")?;
    let auth_str = auth_header.to_str().ok()?;
    auth_str.strip_prefix("Bearer ").map(|s| s.to_string())
}

/// JWT 认证中间件
pub async fn auth_middleware(
    State(state): State<crate::AppState>,
    mut request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let token = extract_token(&request)
        .ok_or(AppError(ApiError::AuthError(AuthError::Unauthorized)))?;

    let claims = verify_token(&token, &state.jwt_secret)
        .map_err(|e| AppError(ApiError::AuthError(e)))?;

    // 将 user_id 插入 request extensions
    request.extensions_mut().insert(claims.sub);

    Ok(next.run(request).await)
}
