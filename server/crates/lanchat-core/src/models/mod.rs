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
    pub uploader_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_serialize_skips_password_hash() {
        let user = User {
            id: Uuid::new_v4(),
            username: "test".to_string(),
            password_hash: "secret".to_string(),
            display_name: Some("Test".to_string()),
            avatar_url: None,
            department: None,
            role: "user".to_string(),
            status: "online".to_string(),
            last_seen_at: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let json = serde_json::to_string(&user).unwrap();
        assert!(!json.contains("secret"), "password_hash 不应出现在 JSON 中");
        assert!(json.contains("test"));
    }

    #[test]
    fn test_group_serialize() {
        let group = Group {
            id: Uuid::new_v4(),
            name: "测试群组".to_string(),
            description: Some("desc".to_string()),
            avatar_url: None,
            group_type: "normal".to_string(),
            max_members: 500,
            created_by: Uuid::new_v4(),
            created_at: Utc::now(),
        };
        let json = serde_json::to_string(&group).unwrap();
        assert!(json.contains("测试群组"));
        assert!(json.contains("500"));
    }

    #[test]
    fn test_message_serialize() {
        let msg = Message {
            id: Uuid::new_v4(),
            sender_id: Uuid::new_v4(),
            receiver_id: Uuid::new_v4(),
            receiver_type: "user".to_string(),
            content: Some("hello".to_string()),
            message_type: "text".to_string(),
            metadata: None,
            is_read: false,
            created_at: Utc::now(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("hello"));
        assert!(json.contains("false"));
    }
}
