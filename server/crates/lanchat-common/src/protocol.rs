//! WebSocket 消息协议定义
//!
//! 所有 WebSocket 通信使用 JSON 格式，通过 `WsMessage` 枚举区分消息类型。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// WebSocket 消息主枚举
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum WsMessage {
    /// 认证请求（连接后第一条消息）
    #[serde(rename = "auth")]
    Auth(AuthPayload),

    /// 认证成功
    #[serde(rename = "auth_ok")]
    AuthOk(AuthOkPayload),

    /// 认证失败
    #[serde(rename = "auth_error")]
    AuthError(ErrorPayload),

    /// 发送消息
    #[serde(rename = "send_message")]
    SendMessage(SendMessagePayload),

    /// 新消息通知（收到他人发送的消息）
    #[serde(rename = "new_message")]
    NewMessage(NewMessagePayload),

    /// 消息发送确认
    #[serde(rename = "message_ack")]
    MessageAck(MessageAckPayload),

    /// 正在输入
    #[serde(rename = "typing")]
    Typing(TypingPayload),

    /// 用户上线/下线通知
    #[serde(rename = "presence")]
    Presence(PresencePayload),

    /// 错误
    #[serde(rename = "error")]
    Error(ErrorPayload),

    /// 心跳请求
    #[serde(rename = "ping")]
    Ping,

    /// 心跳响应
    #[serde(rename = "pong")]
    Pong,
}

/// 认证载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthPayload {
    pub token: String,
}

/// 认证成功载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthOkPayload {
    pub user_id: String,
    pub username: String,
}

/// 发送消息载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessagePayload {
    /// 临时客户端 ID，用于确认
    pub client_msg_id: String,
    /// 接收者 ID（用户或群组）
    pub receiver_id: String,
    /// 接收者类型：user 或 group
    pub receiver_type: String,
    /// 消息内容
    pub content: String,
    /// 消息类型：text, image, file
    pub message_type: String,
    /// 可选元数据
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// 新消息载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewMessagePayload {
    pub id: String,
    pub sender_id: String,
    pub sender_name: String,
    pub receiver_id: String,
    pub receiver_type: String,
    pub content: String,
    pub message_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

/// 消息确认载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageAckPayload {
    /// 客户端临时 ID
    pub client_msg_id: String,
    /// 服务端生成的消息 ID
    pub server_msg_id: String,
    /// 发送时间
    pub created_at: DateTime<Utc>,
}

/// 正在输入载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypingPayload {
    pub sender_id: String,
    pub receiver_id: String,
    pub receiver_type: String,
}

/// 用户在线状态载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresencePayload {
    pub user_id: String,
    pub status: String, // online, away, busy, offline
}

/// 错误载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorPayload {
    pub code: i32,
    pub message: String,
}

impl WsMessage {
    /// 序列化为 JSON 字符串
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| "{}".to_string())
    }

    /// 从 JSON 字符串反序列化
    pub fn from_json(s: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(s)
    }
}
