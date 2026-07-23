//! 数据模型定义

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 用户模型
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub department: Option<String>,
    pub role: String,
    pub status: String,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 群组模型
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Group {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub avatar_url: Option<String>,
    pub group_type: String,
    pub max_members: i32,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
}

/// 群组成员模型
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct GroupMember {
    pub id: Uuid,
    pub group_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

/// 消息模型
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Message {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub receiver_id: Uuid,
    pub receiver_type: String,
    pub content: Option<String>,
    pub message_type: String,
    pub metadata: Option<serde_json::Value>,
    pub is_read: bool,
    pub created_at: DateTime<Utc>,
}

/// 带发送者信息的消息模型（用于历史消息查询）
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MessageWithSender {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub receiver_id: Uuid,
    pub receiver_type: String,
    pub content: Option<String>,
    pub message_type: String,
    pub metadata: Option<serde_json::Value>,
    pub is_read: bool,
    pub created_at: DateTime<Utc>,
    pub sender_name: String,
    pub sender_display_name: Option<String>,
}

/// 文件模型
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct File {
    pub id: Uuid,
    pub original_name: String,
    pub stored_name: String,
    pub mime_type: String,
    pub file_size: i64,
    pub storage_path: String,
    pub thumbnail_path: Option<String>,
    pub uploader_id: Uuid,
    pub created_at: DateTime<Utc>,
}
