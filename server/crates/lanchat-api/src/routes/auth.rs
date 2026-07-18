//! 认证路由

use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use axum::routing::{get, post};
use axum::Router;
use lanchat_common::error::ApiError;
use lanchat_common::types::ApiResponse;
use uuid::Uuid;

use crate::error::AppError;
use crate::AppState;
use lanchat_core::services::auth::{self, AuthResponse, LoginRequest, RegisterRequest};

/// 公开认证路由（无需登录）
pub fn auth_routes() -> Router<AppState> {
    Router::new()
        .route("/login", post(login_handler))
        .route("/register", post(register_handler))
}

/// 需要认证的路由
pub fn auth_protected_routes() -> Router<AppState> {
    Router::new()
        .route("/me", get(me_handler).put(update_me_handler))
        .route("/search", get(search_users_handler))
        .route("/users", get(list_users_handler))
}

/// 登录处理
async fn login_handler(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<(StatusCode, Json<ApiResponse<AuthResponse>>), AppError> {
    let response = auth::login(&state.db, &request.username, &request.password, &state.jwt_secret).await?;
    Ok((StatusCode::OK, Json(ApiResponse::success(response))))
}

/// 注册处理
async fn register_handler(
    State(state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<ApiResponse<AuthResponse>>), AppError> {
    let response = auth::register(
        &state.db,
        &request.username,
        &request.password,
        request.display_name.as_deref(),
        &state.jwt_secret,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(ApiResponse::success(response))))
}

/// 获取当前用户信息
async fn me_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
) -> Result<Json<ApiResponse<lanchat_core::models::User>>, AppError> {
    let uid = Uuid::parse_str(&user_id).map_err(|e| {
        AppError(ApiError::AuthError(lanchat_common::error::AuthError::TokenError(e.to_string())))
    })?;

    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await?
        .ok_or(AppError(ApiError::NotFound("用户不存在".to_string())))?;

    Ok(Json(ApiResponse::success(user)))
}

/// 更新用户资料请求
#[derive(serde::Deserialize)]
struct UpdateMeRequest {
    display_name: Option<String>,
}

/// 更新当前用户资料
async fn update_me_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Json(req): Json<UpdateMeRequest>,
) -> Result<Json<ApiResponse<lanchat_core::models::User>>, AppError> {
    let uid = Uuid::parse_str(&user_id).map_err(|e| {
        AppError(ApiError::AuthError(lanchat_common::error::AuthError::TokenError(e.to_string())))
    })?;

    let user = lanchat_core::repository::user_repository::update_profile(
        &state.db,
        &uid,
        req.display_name.as_deref(),
    )
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?
    .ok_or(AppError(ApiError::NotFound("用户不存在".to_string())))?;

    Ok(Json(ApiResponse::success(user)))
}

/// 用户搜索查询参数
#[derive(serde::Deserialize)]
struct SearchQuery {
    q: String,
    limit: Option<i64>,
}

/// 搜索用户
async fn search_users_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    axum::extract::Query(query): axum::extract::Query<SearchQuery>,
) -> Result<Json<ApiResponse<Vec<lanchat_core::models::User>>>, AppError> {
    let uid = Uuid::parse_str(&user_id).map_err(|e| {
        AppError(ApiError::AuthError(lanchat_common::error::AuthError::TokenError(e.to_string())))
    })?;

    let limit = query.limit.unwrap_or(20).min(50);
    let users = lanchat_core::repository::user_repository::search_users(
        &state.db,
        &query.q,
        &uid,
        limit,
    )
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok(Json(ApiResponse::success(users)))
}

/// 获取所有用户（联系人列表）
async fn list_users_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
) -> Result<Json<ApiResponse<Vec<lanchat_core::models::User>>>, AppError> {
    let uid = Uuid::parse_str(&user_id).map_err(|e| {
        AppError(ApiError::AuthError(lanchat_common::error::AuthError::TokenError(e.to_string())))
    })?;

    let users = lanchat_core::repository::user_repository::get_all_users(
        &state.db,
        &uid,
        100,
    )
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok(Json(ApiResponse::success(users)))
}
