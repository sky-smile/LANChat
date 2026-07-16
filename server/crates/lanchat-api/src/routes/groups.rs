//! 群组相关路由

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use axum::routing::{delete, get, post};
use axum::Router;
use serde::Deserialize;
use uuid::Uuid;

use lanchat_common::error::ApiError;
use lanchat_common::types::ApiResponse;

use crate::error::AppError;
use crate::AppState;
use lanchat_core::models::{Group, GroupMember};

/// 群组路由（需认证）
pub fn group_routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_group_handler))
        .route("/", get(list_user_groups_handler))
        .route("/:group_id", get(get_group_handler))
        .route("/:group_id", delete(delete_group_handler))
        .route("/:group_id/members", get(get_members_handler))
        .route("/:group_id/members", post(add_member_handler))
        .route("/:group_id/members/:user_id", delete(remove_member_handler))
}

/// 创建群组请求
#[derive(Deserialize)]
struct CreateGroupRequest {
    name: String,
    description: Option<String>,
    member_ids: Option<Vec<String>>,
}

/// 创建群组
async fn create_group_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<(StatusCode, Json<ApiResponse<Group>>), AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;

    let group = lanchat_core::services::group::create_group(
        &state.db,
        &req.name,
        req.description.as_deref(),
        &uid,
    )
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    // 添加指定的成员
    if let Some(member_ids) = &req.member_ids {
        for mid in member_ids {
            if let Ok(member_uuid) = Uuid::parse_str(mid) {
                let _ = lanchat_core::services::group::add_member(
                    &state.db,
                    &group.id,
                    &member_uuid,
                    "member",
                )
                .await;
            }
        }
    }

    Ok((StatusCode::CREATED, Json(ApiResponse::success(group))))
}

/// 获取群组详情
async fn get_group_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Path(group_id): Path<String>,
) -> Result<Json<ApiResponse<Group>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;
    let gid = Uuid::parse_str(&group_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的群组ID".to_string())))?;

    // 检查是否是成员
    let is_member = lanchat_core::services::group::is_member(&state.db, &gid, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    if !is_member {
        return Err(AppError(ApiError::NotFound("群组不存在或无权访问".to_string())));
    }

    let group = lanchat_core::services::group::get_group(&state.db, &gid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("群组不存在".to_string())))?;

    Ok(Json(ApiResponse::success(group)))
}

/// 获取用户所在的群组列表
async fn list_user_groups_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
) -> Result<Json<ApiResponse<Vec<Group>>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;

    let groups = lanchat_core::services::group::get_user_groups(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok(Json(ApiResponse::success(groups)))
}

/// 删除群组
async fn delete_group_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Path(group_id): Path<String>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;
    let gid = Uuid::parse_str(&group_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的群组ID".to_string())))?;

    let deleted = lanchat_core::services::group::delete_group(&state.db, &gid, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    if !deleted {
        return Err(AppError(ApiError::NotFound("群组不存在或无权删除".to_string())));
    }

    Ok(Json(ApiResponse::success(true)))
}

/// 群组成员信息（不含密码）
#[derive(serde::Serialize)]
struct MemberInfo {
    id: String,
    username: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
    role: String,
    status: String,
}

/// 获取群组成员列表
async fn get_members_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Path(group_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<MemberInfo>>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;
    let gid = Uuid::parse_str(&group_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的群组ID".to_string())))?;

    let is_member = lanchat_core::services::group::is_member(&state.db, &gid, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    if !is_member {
        return Err(AppError(ApiError::NotFound("群组不存在或无权访问".to_string())));
    }

    let members = lanchat_core::services::group::get_members(&state.db, &gid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    let member_infos: Vec<MemberInfo> = members
        .into_iter()
        .map(|(gm, u)| MemberInfo {
            id: u.id.to_string(),
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            role: gm.role,
            status: u.status,
        })
        .collect();

    Ok(Json(ApiResponse::success(member_infos)))
}

/// 添加成员请求
#[derive(Deserialize)]
struct AddMemberRequest {
    user_id: String,
    role: Option<String>,
}

/// 添加成员到群组
async fn add_member_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Path(group_id): Path<String>,
    Json(req): Json<AddMemberRequest>,
) -> Result<(StatusCode, Json<ApiResponse<GroupMember>>), AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;
    let gid = Uuid::parse_str(&group_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的群组ID".to_string())))?;
    let target_uid = Uuid::parse_str(&req.user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的目标用户ID".to_string())))?;

    // 检查操作者是否是群成员
    let is_member = lanchat_core::services::group::is_member(&state.db, &gid, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    if !is_member {
        return Err(AppError(ApiError::NotFound("群组不存在或无权操作".to_string())));
    }

    let role = req.role.as_deref().unwrap_or("member");
    let member = lanchat_core::services::group::add_member(&state.db, &gid, &target_uid, role)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok((StatusCode::CREATED, Json(ApiResponse::success(member))))
}

/// 移除群组成员
async fn remove_member_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Path((group_id, target_user_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;
    let gid = Uuid::parse_str(&group_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的群组ID".to_string())))?;
    let target_uid = Uuid::parse_str(&target_user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的目标用户ID".to_string())))?;

    // 检查操作者是否是群成员
    let is_member = lanchat_core::services::group::is_member(&state.db, &gid, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    if !is_member {
        return Err(AppError(ApiError::NotFound("群组不存在或无权操作".to_string())));
    }

    let removed = lanchat_core::services::group::remove_member(&state.db, &gid, &target_uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok(Json(ApiResponse::success(removed)))
}
