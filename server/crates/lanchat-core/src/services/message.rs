//! 消息业务服务

use sqlx::PgPool;
use uuid::Uuid;

use crate::models::Message;
use crate::repository::message_repository;

/// 发送消息
pub async fn send_message(
    pool: &PgPool,
    sender_id: &Uuid,
    receiver_id: &Uuid,
    receiver_type: &str,
    content: &str,
    message_type: &str,
    metadata: Option<&serde_json::Value>,
) -> Result<Message, sqlx::Error> {
    message_repository::create_message(
        pool,
        sender_id,
        receiver_id,
        receiver_type,
        content,
        message_type,
        metadata,
    )
    .await
}

/// 获取历史消息
pub async fn get_history(
    pool: &PgPool,
    user_id: &Uuid,
    target_id: &Uuid,
    target_type: &str,
    limit: i64,
    before: Option<&str>,
) -> Result<Vec<Message>, sqlx::Error> {
    if target_type == "group" {
        message_repository::get_group_messages(pool, target_id, limit, before).await
    } else {
        message_repository::get_messages_between_users(pool, user_id, target_id, limit, before)
            .await
    }
}

/// 标记消息已读
pub async fn mark_read(
    pool: &PgPool,
    receiver_id: &Uuid,
    sender_id: &Uuid,
) -> Result<(), sqlx::Error> {
    message_repository::mark_as_read(pool, receiver_id, sender_id).await
}
