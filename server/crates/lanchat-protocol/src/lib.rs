//! LANChat 共享协议和数据传输类型
//!
//! 纯数据定义 crate，无重依赖（无 sqlx、无 argon2、无 jsonwebtoken）。
//! 供服务端和 Tauri 客户端共同使用。

pub mod protocol;
pub mod types;
