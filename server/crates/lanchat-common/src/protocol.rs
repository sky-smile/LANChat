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

    /// 标记消息已读（客户端发送）
    #[serde(rename = "mark_read")]
    MarkRead(MarkReadPayload),

    /// 已读回执通知（服务端推送给消息发送者）
    #[serde(rename = "read_receipt")]
    ReadReceipt(ReadReceiptPayload),

    // ---- WebRTC 语音通话信令 ----

    /// 发起通话邀请（呼叫方 → 服务端 → 被叫方）
    #[serde(rename = "call_invite")]
    CallInvite(CallInvitePayload),

    /// 被叫方接听（被叫方 → 服务端 → 呼叫方）
    #[serde(rename = "call_accept")]
    CallAccept(CallAcceptPayload),

    /// 被叫方拒接（被叫方 → 服务端 → 呼叫方）
    #[serde(rename = "call_reject")]
    CallReject(CallRejectPayload),

    /// 挂断通话（任一方 → 服务端 → 对方）
    #[serde(rename = "call_hangup")]
    CallHangup(CallHangupPayload),

    /// WebRTC SDP Offer（呼叫方 → 服务端 → 被叫方）
    #[serde(rename = "call_offer")]
    CallOffer(CallSdpPayload),

    /// WebRTC SDP Answer（被叫方 → 服务端 → 呼叫方）
    #[serde(rename = "call_answer")]
    CallAnswer(CallSdpPayload),

    /// ICE Candidate 交换（双向）
    #[serde(rename = "call_ice")]
    CallIce(CallIcePayload),

    /// 通话状态通知（服务端 → 双方）
    #[serde(rename = "call_status")]
    CallStatus(CallStatusPayload),
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

/// 标记消息已读载荷（客户端发送）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkReadPayload {
    /// 发送者 ID（即哪些消息被标记为已读）
    pub sender_id: String,
    /// 接收者类型：user 或 group
    pub receiver_type: String,
}

/// 已读回执载荷（服务端推送给消息发送者）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadReceiptPayload {
    /// 谁读了消息
    pub reader_id: String,
    /// 读的是谁发的消息（即当前用户）
    pub sender_id: String,
    /// 消息类型：user 或 group
    pub receiver_type: String,
    /// 已读时间
    pub read_at: DateTime<Utc>,
}

// ---- WebRTC 语音通话信令载荷 ----

/// 通话邀请载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallInvitePayload {
    /// 通话唯一标识
    pub call_id: String,
    /// 呼叫方用户 ID
    pub caller_id: String,
    /// 呼叫方显示名称
    pub caller_name: String,
    /// 被叫方用户 ID
    pub callee_id: String,
}

/// 通话接听载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallAcceptPayload {
    /// 通话唯一标识
    pub call_id: String,
    /// 接听方用户 ID
    pub user_id: String,
}

/// 通话拒接载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallRejectPayload {
    /// 通话唯一标识
    pub call_id: String,
    /// 拒接方用户 ID
    pub user_id: String,
}

/// 挂断通话载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallHangupPayload {
    /// 通话唯一标识
    pub call_id: String,
    /// 挂断方用户 ID
    pub user_id: String,
}

/// WebRTC SDP 载荷（用于 Offer 和 Answer）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallSdpPayload {
    /// 通话唯一标识
    pub call_id: String,
    /// 发送方用户 ID
    pub sender_id: String,
    /// 接收方用户 ID
    pub receiver_id: String,
    /// SDP 类型：offer 或 answer
    pub sdp_type: String,
    /// SDP 内容
    pub sdp: String,
}

/// ICE Candidate 载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallIcePayload {
    /// 通话唯一标识
    pub call_id: String,
    /// 发送方用户 ID
    pub sender_id: String,
    /// 接收方用户 ID
    pub receiver_id: String,
    /// ICE candidate 字符串
    pub candidate: String,
    /// SDP mid
    pub sdp_mid: String,
    /// SDP m-line index
    pub sdp_m_line_index: u16,
}

/// 通话状态载荷（服务端推送给双方）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallStatusPayload {
    /// 通话唯一标识
    pub call_id: String,
    /// 状态：ringing, connected, ended, rejected
    pub status: String,
    /// 可选的状态消息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
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
