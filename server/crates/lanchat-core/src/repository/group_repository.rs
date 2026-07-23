//! 群组数据访问

use sqlx::PgPool;
use sqlx::Row;
use uuid::Uuid;

use crate::models::{Group, GroupMember, User};

/// 创建群组
pub async fn create_group(
    pool: &PgPool,
    name: &str,
    description: Option<&str>,
    created_by: &Uuid,
) -> Result<Group, sqlx::Error> {
    let mut tx = pool.begin().await?;

    // 创建群组
    let group = sqlx::query_as::<_, Group>(
        "INSERT INTO groups (name, description, created_by) VALUES ($1, $2, $3) \
         RETURNING id, name, description, avatar_url, group_type, max_members, created_by, created_at",
    )
    .bind(name)
    .bind(description)
    .bind(created_by)
    .fetch_one(&mut *tx)
    .await?;

    // 将创建者添加为群主 (owner)
    sqlx::query(
        "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')",
    )
    .bind(group.id)
    .bind(created_by)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(group)
}

/// 按 ID 查找群组
pub async fn find_by_id(pool: &PgPool, id: &Uuid) -> Result<Option<Group>, sqlx::Error> {
    sqlx::query_as::<_, Group>(
        "SELECT id, name, description, avatar_url, group_type, max_members, created_by, created_at \
         FROM groups WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// 更新群组信息
pub async fn update_group(
    pool: &PgPool,
    group_id: &Uuid,
    name: Option<&str>,
    description: Option<&str>,
) -> Result<Group, sqlx::Error> {
    // 构建动态 UPDATE 语句
    let mut sets = Vec::new();
    let mut idx = 1;

    if name.is_some() {
        sets.push(format!("name = ${}", idx));
        idx += 1;
    }
    if description.is_some() {
        sets.push(format!("description = ${}", idx));
        idx += 1;
    }

    if sets.is_empty() {
        // 没有需要更新的字段，直接返回现有群组
        return find_by_id(pool, group_id)
            .await?
            .ok_or_else(|| sqlx::Error::RowNotFound);
    }

    let sql = format!(
        "UPDATE groups SET {} WHERE id = ${} RETURNING id, name, description, avatar_url, group_type, max_members, created_by, created_at",
        sets.join(", "),
        idx
    );

    let mut query = sqlx::query_as::<_, Group>(&sql);
    if let Some(n) = name {
        query = query.bind(n);
    }
    if let Some(d) = description {
        query = query.bind(d);
    }
    query = query.bind(group_id);

    query.fetch_one(pool).await
}

/// 添加群组成员
pub async fn add_member(
    pool: &PgPool,
    group_id: &Uuid,
    user_id: &Uuid,
    role: &str,
) -> Result<GroupMember, sqlx::Error> {
    sqlx::query_as::<_, GroupMember>(
        "INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3) \
         ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role \
         RETURNING id, group_id, user_id, role, joined_at",
    )
    .bind(group_id)
    .bind(user_id)
    .bind(role)
    .fetch_one(pool)
    .await
}

/// 移除群组成员
pub async fn remove_member(
    pool: &PgPool,
    group_id: &Uuid,
    user_id: &Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2",
    )
    .bind(group_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// 获取群组成员列表（含用户信息）
pub async fn get_members(
    pool: &PgPool,
    group_id: &Uuid,
) -> Result<Vec<(GroupMember, User)>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT gm.id as gm_id, gm.group_id, gm.user_id, gm.role, gm.joined_at, \
                u.id as u_id, u.username, u.password_hash, u.display_name, u.avatar_url, \
                u.department, u.role as user_role, u.status, u.last_seen_at, \
                u.created_at as u_created_at, u.updated_at \
         FROM group_members gm \
         JOIN users u ON gm.user_id = u.id \
         WHERE gm.group_id = $1 \
         ORDER BY gm.role DESC, gm.joined_at ASC",
    )
    .bind(group_id)
    .fetch_all(pool)
    .await?;

    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        let member = GroupMember {
            id: row.get("gm_id"),
            group_id: row.get("group_id"),
            user_id: row.get("user_id"),
            role: row.get("role"),
            joined_at: row.get("joined_at"),
        };
        let user = User {
            id: row.get("u_id"),
            username: row.get("username"),
            password_hash: row.get("password_hash"),
            display_name: row.get("display_name"),
            avatar_url: row.get("avatar_url"),
            department: row.get("department"),
            role: row.get("user_role"),
            status: row.get("status"),
            last_seen_at: row.get("last_seen_at"),
            created_at: row.get("u_created_at"),
            updated_at: row.get("updated_at"),
        };
        result.push((member, user));
    }
    Ok(result)
}

/// 获取群组成员 ID 列表
pub async fn get_member_ids(
    pool: &PgPool,
    group_id: &Uuid,
) -> Result<Vec<Uuid>, sqlx::Error> {
    let rows = sqlx::query_scalar::<_, Uuid>(
        "SELECT user_id FROM group_members WHERE group_id = $1",
    )
    .bind(group_id)
    .fetch_all(pool)
    .await?;
    Ok(rows)
}

/// 获取用户所在的群组列表
pub async fn get_user_groups(
    pool: &PgPool,
    user_id: &Uuid,
) -> Result<Vec<Group>, sqlx::Error> {
    sqlx::query_as::<_, Group>(
        "SELECT g.id, g.name, g.description, g.avatar_url, g.group_type, g.max_members, g.created_by, g.created_at \
         FROM groups g \
         JOIN group_members gm ON g.id = gm.group_id \
         WHERE gm.user_id = $1 \
         ORDER BY g.created_at DESC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

/// 获取所有群组（管理员专用）
pub async fn get_all_groups(
    pool: &PgPool,
) -> Result<Vec<Group>, sqlx::Error> {
    sqlx::query_as::<_, Group>(
        "SELECT id, name, description, avatar_url, group_type, max_members, created_by, created_at \
         FROM groups \
         ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await
}

/// 检查用户是否是群组成员
pub async fn is_member(
    pool: &PgPool,
    group_id: &Uuid,
    user_id: &Uuid,
) -> Result<bool, sqlx::Error> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2)",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(exists)
}

/// 获取群组成员数量
pub async fn get_member_count(
    pool: &PgPool,
    group_id: &Uuid,
) -> Result<i64, sqlx::Error> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM group_members WHERE group_id = $1",
    )
    .bind(group_id)
    .fetch_one(pool)
    .await?;
    Ok(count)
}

/// 删除群组（仅创建者可操作）
pub async fn delete_group(
    pool: &PgPool,
    group_id: &Uuid,
    user_id: &Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "DELETE FROM groups WHERE id = $1 AND created_by = $2",
    )
    .bind(group_id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

/// 强制删除群组（管理员专用，无需创建者验证）
pub async fn force_delete_group(
    pool: &PgPool,
    group_id: &Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "DELETE FROM groups WHERE id = $1",
    )
    .bind(group_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}
