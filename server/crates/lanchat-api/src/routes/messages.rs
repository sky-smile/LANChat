//! 消息相关路由

use axum::extract::{Path, Query, State};
use axum::Json;
use axum::routing::get;
use axum::Router;
use serde::Deserialize;
use uuid::Uuid;

use lanchat_common::types::ApiResponse;
use lanchat_common::error::{ApiError, AuthError};

use crate::error::AppError;
use crate::AppState;
use lanchat_core::models::MessageWithSender;

/// 需要认证的消息路由
pub fn message_routes() -> Router<AppState> {
    Router::new()
        .route("/history/:target_id/:target_type", get(history_handler))
}

#[derive(Deserialize)]
struct HistoryQuery {
    limit: Option<i64>,
    before: Option<String>,
}

/// 获取历史消息
async fn history_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Path((target_id, target_type)): Path<(String, String)>,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<ApiResponse<Vec<MessageWithSender>>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;
    let tid = Uuid::parse_str(&target_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的目标ID".to_string())))?;

    // 群组消息需要验证用户是否为群成员
    if target_type == "group" {
        let is_member = lanchat_core::services::group::is_member(&state.db, &tid, &uid)
            .await
            .unwrap_or(false);
        if !is_member {
            // 检查是否为管理员（管理员可查看任何群组）
            let is_admin = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
                .await
                .ok()
                .flatten()
                .map(|u| u.role == "admin")
                .unwrap_or(false);
            if !is_admin {
                return Err(AppError(ApiError::AuthError(AuthError::Forbidden)));
            }
        }
    }

    let limit = query.limit.unwrap_or(50).min(100);

    let messages = lanchat_core::services::message::get_history(
        &state.db,
        &uid,
        &tid,
        &target_type,
        limit,
        query.before.as_deref(),
    )
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok(Json(ApiResponse::success(messages)))
}
