//! 群组相关路由

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use axum::routing::{delete, get, post, put};
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
        .route("/:group_id", put(update_group_handler))
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

/// 更新群组请求
#[derive(Deserialize)]
struct UpdateGroupRequest {
    name: Option<String>,
    description: Option<String>,
}

/// 创建群组（仅管理员）
async fn create_group_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Json(req): Json<CreateGroupRequest>,
) -> Result<(StatusCode, Json<ApiResponse<Group>>), AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;

    // 检查是否为管理员
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("用户不存在".to_string())))?;

    if user.role != "admin" {
        return Err(AppError(ApiError::AuthError(lanchat_common::error::AuthError::Forbidden)));
    }

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
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;
    let gid = Uuid::parse_str(&group_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的群组ID".to_string())))?;

    // 检查是否是成员（管理员可访问任意群组）
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("用户不存在".to_string())))?;

    if user.role != "admin" {
        let is_member = lanchat_core::services::group::is_member(&state.db, &gid, &uid)
            .await
            .map_err(|e| AppError(ApiError::DatabaseError(e)))?;
        if !is_member {
            return Err(AppError(ApiError::NotFound("群组不存在或无权访问".to_string())));
        }
    }

    let group = lanchat_core::services::group::get_group(&state.db, &gid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("群组不存在".to_string())))?;

    let member_count = lanchat_core::repository::group_repository::get_member_count(&state.db, &gid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    let can_manage = user.role == "admin";

    let result = serde_json::json!({
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "avatar_url": group.avatar_url,
        "group_type": group.group_type,
        "max_members": group.max_members,
        "created_by": group.created_by,
        "created_at": group.created_at,
        "member_count": member_count,
        "can_manage": can_manage,
        "is_system": group.is_system,
    });

    Ok(Json(ApiResponse::success(result)))
}

/// 更新群组信息（仅管理员）
async fn update_group_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Path(group_id): Path<String>,
    Json(req): Json<UpdateGroupRequest>,
) -> Result<Json<ApiResponse<Group>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;
    let gid = Uuid::parse_str(&group_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的群组ID".to_string())))?;

    // 检查操作者是否是管理员
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("用户不存在".to_string())))?;

    if user.role != "admin" {
        return Err(AppError(ApiError::AuthError(lanchat_common::error::AuthError::Forbidden)));
    }

    let group = lanchat_core::services::group::update_group(
        &state.db,
        &gid,
        req.name.as_deref(),
        req.description.as_deref(),
    )
    .await
    .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok(Json(ApiResponse::success(group)))
}

/// 获取用户所在的群组列表（管理员返回所有群组）
async fn list_user_groups_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;

    // 检查是否为管理员
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("用户不存在".to_string())))?;

    let groups = if user.role == "admin" {
        lanchat_core::services::group::get_all_groups(&state.db)
            .await
            .map_err(|e| AppError(ApiError::DatabaseError(e)))?
    } else {
        lanchat_core::services::group::get_user_groups(&state.db, &uid)
            .await
            .map_err(|e| AppError(ApiError::DatabaseError(e)))?
    };

    let mut result = Vec::new();
    for group in groups {
        let member_count = lanchat_core::repository::group_repository::get_member_count(&state.db, &group.id)
            .await
            .unwrap_or(0);
        // 管理员查看所有群组时，标记是否为成员
        let is_member = if user.role == "admin" {
            lanchat_core::services::group::is_member(&state.db, &group.id, &uid)
                .await
                .unwrap_or(false)
        } else {
            true // 普通用户只看到自己所在的群组，都是成员
        };
        result.push(serde_json::json!({
            "id": group.id,
            "name": group.name,
            "description": group.description,
            "avatar_url": group.avatar_url,
            "member_count": member_count,
            "is_member": is_member,
            "is_system": group.is_system,
        }));
    }

    Ok(Json(ApiResponse::success(result)))
}

/// 删除群组（管理员可删除任意非系统群组，普通用户只能删除自己创建的）
async fn delete_group_handler(
    State(state): State<AppState>,
    axum::extract::Extension(user_id): axum::extract::Extension<String>,
    Path(group_id): Path<String>,
) -> Result<Json<ApiResponse<bool>>, AppError> {
    let uid = Uuid::parse_str(&user_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的用户ID".to_string())))?;
    let gid = Uuid::parse_str(&group_id)
        .map_err(|_| AppError(ApiError::ValidationError("无效的群组ID".to_string())))?;

    // 系统群组不允许删除
    let group = lanchat_core::services::group::get_group(&state.db, &gid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("群组不存在".to_string())))?;
    if group.is_system {
        return Err(AppError(ApiError::ValidationError("系统群组不允许删除".to_string())));
    }

    // 检查是否为管理员
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("用户不存在".to_string())))?;

    let deleted = if user.role == "admin" {
        lanchat_core::services::group::force_delete_group(&state.db, &gid)
            .await
            .map_err(|e| AppError(ApiError::DatabaseError(e)))?
    } else {
        lanchat_core::services::group::delete_group(&state.db, &gid, &uid)
            .await
            .map_err(|e| AppError(ApiError::DatabaseError(e)))?
    };

    if !deleted {
        return Err(AppError(ApiError::NotFound("群组不存在或无权删除".to_string())));
    }

    Ok(Json(ApiResponse::success(true)))
}

/// 群组成员信息（不含密码）
#[derive(serde::Serialize)]
struct MemberInfo {
    id: String,
    account: String,
    name: String,
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

    // 检查是否是成员（管理员可访问任意群组）
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("用户不存在".to_string())))?;

    if user.role != "admin" {
        let is_member = lanchat_core::services::group::is_member(&state.db, &gid, &uid)
            .await
            .map_err(|e| AppError(ApiError::DatabaseError(e)))?;
        if !is_member {
            return Err(AppError(ApiError::NotFound("群组不存在或无权访问".to_string())));
        }
    }

    let members = lanchat_core::services::group::get_members(&state.db, &gid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    let member_infos: Vec<MemberInfo> = members
        .into_iter()
        .map(|(gm, u)| MemberInfo {
            id: u.id.to_string(),
            account: u.account,
            name: u.name,
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

/// 添加成员到群组（仅管理员）
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

    // 检查操作者是否是管理员
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("用户不存在".to_string())))?;

    if user.role != "admin" {
        return Err(AppError(ApiError::AuthError(lanchat_common::error::AuthError::Forbidden)));
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

    // 检查操作者权限
    let user = lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?
        .ok_or_else(|| AppError(ApiError::NotFound("用户不存在".to_string())))?;

    // 管理员可以移除任何成员
    if user.role != "admin" {
        // 获取操作者的群内角色
        let operator_role = lanchat_core::repository::group_repository::get_member_role(&state.db, &gid, &uid)
            .await
            .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

        match operator_role {
            Some(role) if role == "owner" => {
                // 群主可以移除普通成员，但不能移除自己
                if uid == target_uid {
                    // 群主不能直接退出，需先转让群主
                    return Err(AppError(ApiError::ValidationError("群主不能直接退出群组，请先转让群主".to_string())));
                }
            }
            Some(_) => {
                // 普通成员只能移除自己（退出群组）
                if uid != target_uid {
                    return Err(AppError(ApiError::AuthError(lanchat_common::error::AuthError::Forbidden)));
                }
            }
            None => {
                // 非群成员无权操作
                return Err(AppError(ApiError::AuthError(lanchat_common::error::AuthError::Forbidden)));
            }
        }
    }

    // 检查目标用户是否是群主（群主不能被移除）
    let target_role = lanchat_core::repository::group_repository::get_member_role(&state.db, &gid, &target_uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    if target_role.as_deref() == Some("owner") && user.role != "admin" {
        return Err(AppError(ApiError::ValidationError("不能移除群主".to_string())));
    }

    let removed = lanchat_core::services::group::remove_member(&state.db, &gid, &target_uid)
        .await
        .map_err(|e| AppError(ApiError::DatabaseError(e)))?;

    Ok(Json(ApiResponse::success(removed)))
}
