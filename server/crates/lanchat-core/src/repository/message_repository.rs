//! 消息数据访问

use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{Message, MessageWithSender};

/// 保存消息到数据库
pub async fn create_message(
    pool: &PgPool,
    sender_id: &Uuid,
    receiver_id: &Uuid,
    receiver_type: &str,
    content: &str,
    message_type: &str,
    metadata: Option<&serde_json::Value>,
) -> Result<Message, sqlx::Error> {
    sqlx::query_as::<_, Message>(
        "INSERT INTO messages (sender_id, receiver_id, receiver_type, content, message_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, sender_id, receiver_id, receiver_type, content, message_type, metadata, is_read, created_at",
    )
    .bind(sender_id)
    .bind(receiver_id)
    .bind(receiver_type)
    .bind(content)
    .bind(message_type)
    .bind(metadata)
    .fetch_one(pool)
    .await
}

/// 获取与某用户的历史消息（一对一，带发送者信息）
pub async fn get_messages_between_users(
    pool: &PgPool,
    user1_id: &Uuid,
    user2_id: &Uuid,
    limit: i64,
    before: Option<&str>,
) -> Result<Vec<MessageWithSender>, sqlx::Error> {
    if let Some(before_ts) = before {
        sqlx::query_as::<_, MessageWithSender>(
            "SELECT m.id, m.sender_id, m.receiver_id, m.receiver_type, m.content, m.message_type,
                    m.metadata, m.is_read, m.created_at,
                    u.account AS sender_account, u.name AS sender_name
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             WHERE m.receiver_type = 'user'
               AND (
                 (m.sender_id = $1 AND m.receiver_id = $2)
                 OR (m.sender_id = $2 AND m.receiver_id = $1)
               )
               AND m.created_at < $4
             ORDER BY m.created_at DESC
             LIMIT $3",
        )
        .bind(user1_id)
        .bind(user2_id)
        .bind(limit)
        .bind(before_ts)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, MessageWithSender>(
            "SELECT m.id, m.sender_id, m.receiver_id, m.receiver_type, m.content, m.message_type,
                    m.metadata, m.is_read, m.created_at,
                    u.account AS sender_account, u.name AS sender_name
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             WHERE m.receiver_type = 'user'
               AND (
                 (m.sender_id = $1 AND m.receiver_id = $2)
                 OR (m.sender_id = $2 AND m.receiver_id = $1)
               )
             ORDER BY m.created_at DESC
             LIMIT $3",
        )
        .bind(user1_id)
        .bind(user2_id)
        .bind(limit)
        .fetch_all(pool)
        .await
    }
}

/// 获取群组的历史消息（带发送者信息）
pub async fn get_group_messages(
    pool: &PgPool,
    group_id: &Uuid,
    limit: i64,
    before: Option<&str>,
) -> Result<Vec<MessageWithSender>, sqlx::Error> {
    if let Some(before_ts) = before {
        sqlx::query_as::<_, MessageWithSender>(
            "SELECT m.id, m.sender_id, m.receiver_id, m.receiver_type, m.content, m.message_type,
                    m.metadata, m.is_read, m.created_at,
                    u.account AS sender_account, u.name AS sender_name
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             WHERE m.receiver_id = $1 AND m.receiver_type = 'group'
               AND m.created_at < $3
             ORDER BY m.created_at DESC
             LIMIT $2",
        )
        .bind(group_id)
        .bind(limit)
        .bind(before_ts)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, MessageWithSender>(
            "SELECT m.id, m.sender_id, m.receiver_id, m.receiver_type, m.content, m.message_type,
                    m.metadata, m.is_read, m.created_at,
                    u.account AS sender_account, u.name AS sender_name
             FROM messages m
             JOIN users u ON u.id = m.sender_id
             WHERE m.receiver_id = $1 AND m.receiver_type = 'group'
             ORDER BY m.created_at DESC
             LIMIT $2",
        )
        .bind(group_id)
        .bind(limit)
        .fetch_all(pool)
        .await
    }
}

/// 标记消息为已读
pub async fn mark_as_read(
    pool: &PgPool,
    receiver_id: &Uuid,
    sender_id: &Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE messages SET is_read = TRUE
         WHERE receiver_id = $1 AND sender_id = $2 AND receiver_type = 'user' AND is_read = FALSE",
    )
    .bind(receiver_id)
    .bind(sender_id)
    .execute(pool)
    .await?;
    Ok(())
}
