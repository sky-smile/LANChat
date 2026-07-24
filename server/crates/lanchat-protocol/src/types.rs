//! 共享类型定义

use serde::{Deserialize, Serialize};

/// API 统一响应格式
#[derive(Debug, Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub code: i32,
    pub message: String,
    pub data: Option<T>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            code: 0,
            message: "success".to_string(),
            data: Some(data),
        }
    }

    pub fn error(code: i32, message: String) -> Self {
        Self {
            code,
            message,
            data: None,
        }
    }
}

/// 用户状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum UserStatus {
    #[serde(rename = "online")]
    Online,
    #[serde(rename = "away")]
    Away,
    #[serde(rename = "busy")]
    Busy,
    #[serde(rename = "offline")]
    Offline,
}

/// 消息类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MessageType {
    #[serde(rename = "text")]
    Text,
    #[serde(rename = "image")]
    Image,
    #[serde(rename = "file")]
    File,
    #[serde(rename = "system")]
    System,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_response_success() {
        let resp = ApiResponse::success("data");
        assert_eq!(resp.code, 0);
        assert_eq!(resp.message, "success");
        assert!(resp.data.is_some());
    }

    #[test]
    fn test_api_response_error() {
        let resp: ApiResponse<()> = ApiResponse::error(404, "未找到".to_string());
        assert_eq!(resp.code, 404);
        assert_eq!(resp.message, "未找到");
        assert!(resp.data.is_none());
    }

    #[test]
    fn test_user_status_serialize() {
        let status = UserStatus::Online;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"online\"");
    }

    #[test]
    fn test_message_type_roundtrip() {
        let types = vec![MessageType::Text, MessageType::Image, MessageType::File, MessageType::System];
        for mt in types {
            let json = serde_json::to_string(&mt).unwrap();
            let parsed: MessageType = serde_json::from_str(&json).unwrap();
            assert_eq!(mt, parsed);
        }
    }
}
