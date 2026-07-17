//! API 错误处理

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use lanchat_common::error::{ApiError, AuthError};
use lanchat_common::types::ApiResponse;

/// API 错误包装类型（用于实现 IntoResponse）
#[derive(Debug)]
pub struct AppError(pub ApiError);

impl From<ApiError> for AppError {
    fn from(err: ApiError) -> Self {
        AppError(err)
    }
}

impl From<AuthError> for AppError {
    fn from(err: AuthError) -> Self {
        AppError(ApiError::AuthError(err))
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        AppError(ApiError::DatabaseError(err))
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self.0 {
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            ApiError::ValidationError(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::DatabaseError(e) => {
                tracing::error!("数据库错误: {:?}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误".to_string())
            }
            ApiError::AuthError(e) => {
                let status = match &e {
                    lanchat_common::error::AuthError::Forbidden => StatusCode::FORBIDDEN,
                    _ => StatusCode::UNAUTHORIZED,
                };
                (status, e.to_string())
            }
            ApiError::InternalError(msg) => {
                tracing::error!("内部错误: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误".to_string())
            }
        };

        let body = ApiResponse::<()>::error(status.as_u16() as i32, message);
        (status, Json(body)).into_response()
    }
}
