//! 群组业务服务

use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{Group, GroupMember, User};
use crate::repository::group_repository;

/// 创建群组
pub async fn create_group(
    pool: &PgPool,
    name: &str,
    description: Option<&str>,
    created_by: &Uuid,
) -> Result<Group, sqlx::Error> {
    group_repository::create_group(pool, name, description, created_by).await
}

/// 获取群组详情
pub async fn get_group(
    pool: &PgPool,
    group_id: &Uuid,
) -> Result<Option<Group>, sqlx::Error> {
    group_repository::find_by_id(pool, group_id).await
}

/// 添加成员到群组
pub async fn add_member(
    pool: &PgPool,
    group_id: &Uuid,
    user_id: &Uuid,
    role: &str,
) -> Result<GroupMember, sqlx::Error> {
    group_repository::add_member(pool, group_id, user_id, role).await
}

/// 从群组移除成员
pub async fn remove_member(
    pool: &PgPool,
    group_id: &Uuid,
    user_id: &Uuid,
) -> Result<bool, sqlx::Error> {
    group_repository::remove_member(pool, group_id, user_id).await
}

/// 获取群组成员列表
pub async fn get_members(
    pool: &PgPool,
    group_id: &Uuid,
) -> Result<Vec<(GroupMember, User)>, sqlx::Error> {
    group_repository::get_members(pool, group_id).await
}

/// 获取群组成员 ID 列表（用于消息广播）
pub async fn get_member_ids(
    pool: &PgPool,
    group_id: &Uuid,
) -> Result<Vec<Uuid>, sqlx::Error> {
    group_repository::get_member_ids(pool, group_id).await
}

/// 获取用户所在的群组
pub async fn get_user_groups(
    pool: &PgPool,
    user_id: &Uuid,
) -> Result<Vec<Group>, sqlx::Error> {
    group_repository::get_user_groups(pool, user_id).await
}

/// 检查用户是否是群组成员
pub async fn is_member(
    pool: &PgPool,
    group_id: &Uuid,
    user_id: &Uuid,
) -> Result<bool, sqlx::Error> {
    group_repository::is_member(pool, group_id, user_id).await
}

/// 删除群组
pub async fn delete_group(
    pool: &PgPool,
    group_id: &Uuid,
    user_id: &Uuid,
) -> Result<bool, sqlx::Error> {
    group_repository::delete_group(pool, group_id, user_id).await
}
