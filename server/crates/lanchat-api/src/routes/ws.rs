//! WebSocket 连接处理

use std::collections::HashMap;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

use fred::interfaces::KeysInterface;
use lanchat_common::auth::verify_token;
use lanchat_common::protocol::*;

use crate::{AppState, GroupCallInfo};

/// 在线用户连接映射：user_id -> (消息发送器, 连接令牌)
/// 连接令牌用于区分同一用户的多个连接，避免重连时误删新连接
pub type Connections = Arc<RwLock<HashMap<String, (mpsc::UnboundedSender<Message>, Uuid)>>>;

/// 创建连接管理器
pub fn create_connections() -> Connections {
    Arc::new(RwLock::new(HashMap::new()))
}

/// WebSocket 升级处理
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

/// 处理单个 WebSocket 连接
async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // 认证阶段：等待第一条 auth 消息
    let user_id = match receiver.next().await {
        Some(Ok(Message::Text(text))) => {
            match WsMessage::from_json(&text) {
                Ok(WsMessage::Auth(auth)) => {
                    match verify_token(&auth.token, &state.jwt_secret) {
                        Ok(claims) => {
                            // 认证成功
                            let user_id = claims.sub.clone();

                            // 从数据库获取用户名
                            let display_name = if let Ok(uid) = Uuid::parse_str(&user_id) {
                                lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
                                    .await
                                    .ok()
                                    .flatten()
                                    .and_then(|u| u.display_name)
                                    .unwrap_or_else(|| user_id.clone())
                            } else {
                                user_id.clone()
                            };

                            let auth_ok = WsMessage::AuthOk(AuthOkPayload {
                                user_id: user_id.clone(),
                                username: display_name,
                            });
                            let _ = tx.send(Message::Text(auth_ok.to_json().into()));
                            user_id
                        }
                        Err(e) => {
                            let err = WsMessage::AuthError(ErrorPayload {
                                code: 401,
                                message: format!("认证失败: {}", e),
                            });
                            let _ = tx.send(Message::Text(err.to_json().into()));
                            return;
                        }
                    }
                }
                _ => {
                    let err = WsMessage::AuthError(ErrorPayload {
                        code: 400,
                        message: "首条消息必须是 auth 类型".to_string(),
                    });
                    let _ = tx.send(Message::Text(err.to_json().into()));
                    return;
                }
            }
        }
        _ => return, // 连接立即关闭
    };

    // 注册连接
    let conn_token = Uuid::new_v4();
    {
        let mut conns = state.connections.write().await;
        // 如果同一用户已有连接，关闭旧连接
        if let Some((old_tx, _)) = conns.insert(user_id.clone(), (tx.clone(), conn_token)) {
            let _ = old_tx.send(Message::Close(None));
        }
    }

    // 更新用户在线状态
    update_user_status(&state, &user_id, "online").await;

    // 广播上线通知
    broadcast_presence(&state, &user_id, "online", Some(&user_id)).await;

    // 发送消息的任务
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    // 接收消息的任务
    let recv_state = state.clone();
    let recv_user_id = user_id.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    handle_text_message(&recv_state, &recv_user_id, &text).await;
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // 等待任一任务完成
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    // 清理：仅当连接 token 匹配时才移除（避免重连时误删新连接）
    {
        let mut conns = state.connections.write().await;
        if let Some((_, token)) = conns.get(&user_id) {
            if *token == conn_token {
                conns.remove(&user_id);
            }
        }
    }

    update_user_status(&state, &user_id, "offline").await;
    broadcast_presence(&state, &user_id, "offline", None).await;
}

/// 处理文本消息
async fn handle_text_message(state: &AppState, user_id: &str, text: &str) {
    let msg = match WsMessage::from_json(text) {
        Ok(msg) => msg,
        Err(e) => {
            tracing::warn!("解析 WebSocket 消息失败: {}", e);
            return;
        }
    };

    match msg {
        WsMessage::SendMessage(payload) => {
            handle_send_message(state, user_id, payload).await;
        }
        WsMessage::Typing(payload) => {
            handle_typing(state, user_id, payload).await;
        }
        WsMessage::MarkRead(payload) => {
            handle_mark_read(state, user_id, payload).await;
        }
        WsMessage::CallInvite(payload) => {
            handle_call_invite(state, user_id, payload).await;
        }
        WsMessage::CallAccept(payload) => {
            handle_call_accept(state, user_id, payload).await;
        }
        WsMessage::CallReject(payload) => {
            handle_call_reject(state, user_id, payload).await;
        }
        WsMessage::CallHangup(payload) => {
            handle_call_hangup(state, user_id, payload).await;
        }
        WsMessage::CallOffer(payload) => {
            let receiver_id = payload.receiver_id.clone();
            let call_id = payload.call_id.clone();
            handle_call_sdp_forward(state, user_id, &call_id, &receiver_id, WsMessage::CallOffer(payload)).await;
        }
        WsMessage::CallAnswer(payload) => {
            let receiver_id = payload.receiver_id.clone();
            let call_id = payload.call_id.clone();
            handle_call_sdp_forward(state, user_id, &call_id, &receiver_id, WsMessage::CallAnswer(payload)).await;
        }
        WsMessage::CallIce(payload) => {
            let receiver_id = payload.receiver_id.clone();
            let call_id = payload.call_id.clone();
            handle_call_ice_forward(state, user_id, &call_id, &receiver_id, payload).await;
        }
        // ---- 多人通话信令 ----
        WsMessage::GroupCallCreate(payload) => {
            handle_group_call_create(state, user_id, payload).await;
        }
        WsMessage::GroupCallJoin(payload) => {
            handle_group_call_join(state, user_id, payload).await;
        }
        WsMessage::GroupCallLeave(payload) => {
            handle_group_call_leave(state, user_id, payload).await;
        }
        WsMessage::Ping => {
            let conns = state.connections.read().await;
            if let Some((tx, _)) = conns.get(user_id) {
                let _ = tx.send(Message::Text(WsMessage::Pong.to_json().into()));
            }
        }
        _ => {
            tracing::debug!("收到未处理的消息类型: {:?}", msg);
        }
    }
}

/// 处理发送消息
async fn handle_send_message(state: &AppState, sender_id: &str, payload: SendMessagePayload) {
    let sender_uuid = match Uuid::parse_str(sender_id) {
        Ok(id) => id,
        Err(_) => return,
    };
    let receiver_uuid = match Uuid::parse_str(&payload.receiver_id) {
        Ok(id) => id,
        Err(_) => return,
    };

    // 群组消息需要验证发送者是否为群成员
    if payload.receiver_type == "group" {
        let is_member = lanchat_core::services::group::is_member(&state.db, &receiver_uuid, &sender_uuid)
            .await
            .unwrap_or(false);
        if !is_member {
            tracing::warn!("用户 {} 尝试向非成员群组 {} 发送消息", sender_id, payload.receiver_id);
            // 发送错误通知给发送者
            let conns = state.connections.read().await;
            if let Some((tx, _)) = conns.get(sender_id) {
                let err_msg = serde_json::json!({
                    "type": "error",
                    "payload": { "message": "您不是该群组的成员，无法发送消息" }
                });
                let _ = tx.send(Message::Text(err_msg.to_string().into()));
            }
            return;
        }
    }

    // 保存消息到数据库
    let message = match lanchat_core::services::message::send_message(
        &state.db,
        &sender_uuid,
        &receiver_uuid,
        &payload.receiver_type,
        &payload.content,
        &payload.message_type,
        payload.metadata.as_ref(),
    )
    .await
    {
        Ok(msg) => msg,
        Err(e) => {
            tracing::error!("保存消息失败: {}", e);
            return;
        }
    };

    // 获取发送者名称
    let sender_name = lanchat_core::repository::user_repository::find_by_id(&state.db, &sender_uuid)
        .await
        .ok()
        .flatten()
        .map(|u| u.display_name.unwrap_or(u.username))
        .unwrap_or_else(|| sender_id.to_string());

    // 发送确认给发送者
    {
        let conns = state.connections.read().await;
        if let Some((tx, _)) = conns.get(sender_id) {
            let ack = WsMessage::MessageAck(MessageAckPayload {
                client_msg_id: payload.client_msg_id,
                server_msg_id: message.id.to_string(),
                created_at: message.created_at,
            });
            let _ = tx.send(Message::Text(ack.to_json().into()));
        }
    }

    // 构造新消息通知
    let new_msg = WsMessage::NewMessage(NewMessagePayload {
        id: message.id.to_string(),
        sender_id: sender_id.to_string(),
        sender_name,
        receiver_id: payload.receiver_id.clone(),
        receiver_type: payload.receiver_type.clone(),
        content: payload.content,
        message_type: payload.message_type,
        metadata: payload.metadata,
        created_at: message.created_at,
    });
    let new_msg_text = new_msg.to_json();

    if payload.receiver_type == "user" {
        // 一对一消息：发送给接收者
        let conns = state.connections.read().await;
        if let Some((tx, _)) = conns.get(&payload.receiver_id) {
            let _ = tx.send(Message::Text(new_msg_text.into()));
        }
    } else if payload.receiver_type == "group" {
        // 群组消息：发送给群组所有在线成员（除了发送者）
        if let Ok(group_uuid) = Uuid::parse_str(&payload.receiver_id) {
            match lanchat_core::services::group::get_member_ids(&state.db, &group_uuid).await {
                Ok(member_ids) => {
                    let conns = state.connections.read().await;
                    for mid in &member_ids {
                        let mid_str = mid.to_string();
                        if mid_str != sender_id {
                            if let Some((tx, _)) = conns.get(&mid_str) {
                                let _ = tx.send(Message::Text(new_msg_text.clone().into()));
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("获取群组成员失败: {}", e);
                }
            }
        }
    }
}

/// 处理正在输入
async fn handle_typing(state: &AppState, sender_id: &str, payload: TypingPayload) {
    let conns = state.connections.read().await;
    if let Some((tx, _)) = conns.get(&payload.receiver_id) {
        let typing = WsMessage::Typing(TypingPayload {
            sender_id: sender_id.to_string(),
            ..payload
        });
        let _ = tx.send(Message::Text(typing.to_json().into()));
    }
}

/// 处理标记已读
async fn handle_mark_read(state: &AppState, reader_id: &str, payload: MarkReadPayload) {
    let reader_uuid = match Uuid::parse_str(reader_id) {
        Ok(id) => id,
        Err(_) => return,
    };
    let sender_uuid = match Uuid::parse_str(&payload.sender_id) {
        Ok(id) => id,
        Err(_) => return,
    };

    // 标记数据库中的消息为已读
    if let Err(e) = lanchat_core::services::message::mark_read(
        &state.db,
        &reader_uuid,
        &sender_uuid,
    )
    .await
    {
        tracing::error!("标记消息已读失败: {}", e);
        return;
    }

    // 通知消息发送者：你的消息已被阅读
    let read_at = chrono::Utc::now();
    let receipt = WsMessage::ReadReceipt(ReadReceiptPayload {
        reader_id: reader_id.to_string(),
        sender_id: payload.sender_id.clone(),
        receiver_type: payload.receiver_type.clone(),
        read_at,
    });
    let receipt_text = receipt.to_json();

    let conns = state.connections.read().await;
    if let Some((tx, _)) = conns.get(&payload.sender_id) {
        let _ = tx.send(Message::Text(receipt_text.into()));
    }
}

// ---- WebRTC 语音通话信令处理 ----

/// 处理通话邀请：转发给被叫方
async fn handle_call_invite(state: &AppState, caller_id: &str, payload: CallInvitePayload) {
    let callee_id = &payload.callee_id;
    tracing::info!("收到通话邀请: caller={}, callee={}, call_id={}", caller_id, callee_id, payload.call_id);

    // 记录活跃通话
    state.active_calls.write().await.insert(
        payload.call_id.clone(),
        crate::CallInfo {
            caller_id: caller_id.to_string(),
            callee_id: callee_id.clone(),
        },
    );

    // 检查被叫方是否在线
    let conns = state.connections.read().await;
    if let Some((tx, _)) = conns.get(callee_id) {
        // 转发邀请给被叫方
        let invite = WsMessage::CallInvite(payload.clone());
        let _ = tx.send(Message::Text(invite.to_json().into()));

        // 通知呼叫方：对方正在响铃
        if let Some((caller_tx, _)) = conns.get(caller_id) {
            let status = WsMessage::CallStatus(CallStatusPayload {
                call_id: payload.call_id.clone(),
                status: "ringing".to_string(),
                message: None,
            });
            let _ = caller_tx.send(Message::Text(status.to_json().into()));
        }
    } else {
        // 被叫方不在线，通知呼叫方
        if let Some((caller_tx, _)) = conns.get(caller_id) {
            let status = WsMessage::CallStatus(CallStatusPayload {
                call_id: payload.call_id,
                status: "ended".to_string(),
                message: Some("对方不在线".to_string()),
            });
            let _ = caller_tx.send(Message::Text(status.to_json().into()));
        }
    }
}

/// 处理通话接听：通知呼叫方对方已接听
async fn handle_call_accept(state: &AppState, user_id: &str, payload: CallAcceptPayload) {
    // 校验：只有被叫方才能接听
    let call_info = {
        let calls = state.active_calls.read().await;
        calls.get(&payload.call_id).cloned()
    };

    let call_info = match call_info {
        Some(info) => info,
        None => return, // 通话不存在
    };

    if call_info.callee_id != user_id {
        tracing::warn!("用户 {} 尝试接听非自己的通话 {}", user_id, payload.call_id);
        return; // 非被叫方，忽略
    }

    let caller_id = &call_info.caller_id;

    let conns = state.connections.read().await;
    // 通知呼叫方：通话已接通
    if let Some((tx, _)) = conns.get(caller_id) {
        let status = WsMessage::CallStatus(CallStatusPayload {
            call_id: payload.call_id.clone(),
            status: "connected".to_string(),
            message: None,
        });
        let _ = tx.send(Message::Text(status.to_json().into()));
    }
    // 通知接听方：通话已接通
    if let Some((tx, _)) = conns.get(user_id) {
        let status = WsMessage::CallStatus(CallStatusPayload {
            call_id: payload.call_id.clone(),
            status: "connected".to_string(),
            message: None,
        });
        let _ = tx.send(Message::Text(status.to_json().into()));
    }
}

/// 处理通话拒接：通知呼叫方
async fn handle_call_reject(state: &AppState, user_id: &str, payload: CallRejectPayload) {
    // 校验：只有被叫方才能拒接
    let call_info = {
        let calls = state.active_calls.read().await;
        calls.get(&payload.call_id).cloned()
    };

    let call_info = match call_info {
        Some(info) => info,
        None => return, // 通话不存在
    };

    if call_info.callee_id != user_id {
        tracing::warn!("用户 {} 尝试拒接非自己的通话 {}", user_id, payload.call_id);
        return; // 非被叫方，忽略
    }

    let conns = state.connections.read().await;
    if let Some((tx, _)) = conns.get(&call_info.caller_id) {
        let status = WsMessage::CallStatus(CallStatusPayload {
            call_id: payload.call_id.clone(),
            status: "rejected".to_string(),
            message: None,
        });
        let _ = tx.send(Message::Text(status.to_json().into()));
    }

    // 清理通话记录
    drop(conns);
    state.active_calls.write().await.remove(&payload.call_id);
}

/// 处理挂断：通知对方通话结束
async fn handle_call_hangup(state: &AppState, user_id: &str, payload: CallHangupPayload) {
    // 校验：只有通话参与方才能挂断
    let call_info = {
        let calls = state.active_calls.read().await;
        calls.get(&payload.call_id).cloned()
    };

    let call_info = match call_info {
        Some(info) => info,
        None => return, // 通话不存在
    };

    if call_info.caller_id != user_id && call_info.callee_id != user_id {
        tracing::warn!("用户 {} 尝试挂断非参与的通话 {}", user_id, payload.call_id);
        return; // 非参与方，忽略
    }

    // 查找通话的另一方
    let other_id = if call_info.caller_id == user_id {
        &call_info.callee_id
    } else {
        &call_info.caller_id
    };

    let conns = state.connections.read().await;
    if let Some((tx, _)) = conns.get(other_id) {
        let status = WsMessage::CallStatus(CallStatusPayload {
            call_id: payload.call_id.clone(),
            status: "ended".to_string(),
            message: None,
        });
        let _ = tx.send(Message::Text(status.to_json().into()));
    }

    // 清理通话记录
    drop(conns);
    state.active_calls.write().await.remove(&payload.call_id);
}

/// 转发 SDP（Offer/Answer）给对方
async fn handle_call_sdp_forward(state: &AppState, user_id: &str, call_id: &str, receiver_id: &str, msg: WsMessage) {
    // 校验：只有通话参与方才能转发 SDP
    let call_info = {
        let calls = state.active_calls.read().await;
        calls.get(call_id).cloned()
    };

    if let Some(info) = call_info {
        if info.caller_id != user_id && info.callee_id != user_id {
            tracing::warn!("用户 {} 尝试转发非参与通话 {} 的 SDP", user_id, call_id);
            return; // 非参与方，忽略
        }
    }

    let conns = state.connections.read().await;
    if let Some((tx, _)) = conns.get(receiver_id) {
        let _ = tx.send(Message::Text(msg.to_json().into()));
    }
}

/// 转发 ICE Candidate 给对方
async fn handle_call_ice_forward(state: &AppState, user_id: &str, call_id: &str, receiver_id: &str, payload: CallIcePayload) {
    // 校验：只有通话参与方才能转发 ICE
    let call_info = {
        let calls = state.active_calls.read().await;
        calls.get(call_id).cloned()
    };

    if let Some(info) = call_info {
        if info.caller_id != user_id && info.callee_id != user_id {
            tracing::warn!("用户 {} 尝试转发非参与通话 {} 的 ICE", user_id, call_id);
            return; // 非参与方，忽略
        }
    }

    let conns = state.connections.read().await;
    if let Some((tx, _)) = conns.get(receiver_id) {
        let ice = WsMessage::CallIce(payload);
        let _ = tx.send(Message::Text(ice.to_json().into()));
    }
}

/// 更新用户在线状态
async fn update_user_status(state: &AppState, user_id: &str, status: &str) {
    if let Ok(uid) = Uuid::parse_str(user_id) {
        // 更新数据库
        let _ = sqlx::query(
            "UPDATE users SET status = $1, last_seen_at = NOW() WHERE id = $2",
        )
        .bind(status)
        .bind(uid)
        .execute(&state.db)
        .await;

        // 更新 Redis
        let key = format!("user:status:{}", user_id);
        let _: Result<(), _> = state.redis.set(&key, status, None, None, false).await;
    }
}

/// 广播在线状态
async fn broadcast_presence(state: &AppState, user_id: &str, status: &str, exclude: Option<&str>) {
    let presence = WsMessage::Presence(PresencePayload {
        user_id: user_id.to_string(),
        status: status.to_string(),
    });
    let text = presence.to_json();

    let conns = state.connections.read().await;
    for (uid, (tx, _)) in conns.iter() {
        if Some(uid.as_str()) != exclude {
            let _ = tx.send(Message::Text(text.clone().into()));
        }
    }
}

// ---- 多人通话处理函数 ----

/// 处理创建群组通话
async fn handle_group_call_create(state: &AppState, user_id: &str, payload: GroupCallCreatePayload) {
    tracing::info!(
        "创建群组通话: call_id={}, group_id={}, creator={}",
        payload.call_id, payload.group_id, user_id
    );

    // 获取创建者名称
    let creator_name = if let Ok(uid) = Uuid::parse_str(user_id) {
        lanchat_core::repository::user_repository::find_by_id(&state.db, &uid)
            .await
            .ok()
            .flatten()
            .and_then(|u| u.display_name)
            .unwrap_or_else(|| user_id.to_string())
    } else {
        user_id.to_string()
    };

    // 创建群组通话记录
    let mut participants = HashMap::new();
    participants.insert(user_id.to_string(), creator_name.clone());

    let group_call_info = GroupCallInfo {
        group_id: payload.group_id.clone(),
        creator_id: user_id.to_string(),
        participants,
    };

    state.active_group_calls.write().await.insert(payload.call_id.clone(), group_call_info);

    // 通知创建者通话已创建
    let conns = state.connections.read().await;
    if let Some((tx, _)) = conns.get(user_id) {
        let participants_payload = GroupCallParticipantsPayload {
            call_id: payload.call_id.clone(),
            participants: vec![GroupCallParticipant {
                user_id: user_id.to_string(),
                user_name: creator_name.clone(),
                is_muted: false,
            }],
        };
        let _ = tx.send(Message::Text(WsMessage::GroupCallParticipants(participants_payload).to_json().into()));
    }

    // 通知群组其他成员有通话可以加入
    if let Ok(group_uuid) = Uuid::parse_str(&payload.group_id) {
        match lanchat_core::services::group::get_member_ids(&state.db, &group_uuid).await {
            Ok(member_ids) => {
                let conns = state.connections.read().await;
                for member_id in &member_ids {
                    let member_str = member_id.to_string();
                    if member_str == user_id {
                        continue; // 跳过创建者
                    }
                    if let Some((tx, _)) = conns.get(&member_str) {
                        let invite = GroupCallInvitePayload {
                            call_id: payload.call_id.clone(),
                            group_id: payload.group_id.clone(),
                            group_name: format!("群组通话"), // 简化处理
                            caller_id: user_id.to_string(),
                            caller_name: creator_name.clone(),
                        };
                        let _ = tx.send(Message::Text(WsMessage::GroupCallInvite(invite).to_json().into()));
                    }
                }
            }
            Err(e) => {
                tracing::warn!("获取群组成员失败: {}", e);
            }
        }
    }

    // TODO: 通知群组其他成员有通话可以加入
}

/// 处理加入群组通话
async fn handle_group_call_join(state: &AppState, user_id: &str, payload: GroupCallJoinPayload) {
    tracing::info!(
        "加入群组通话: call_id={}, user={}",
        payload.call_id, user_id
    );

    let mut group_calls = state.active_group_calls.write().await;
    if let Some(call_info) = group_calls.get_mut(&payload.call_id) {
        // 添加参与者
        call_info.participants.insert(user_id.to_string(), payload.user_name.clone());

        // 构建参与者列表
        let participants: Vec<GroupCallParticipant> = call_info
            .participants
            .iter()
            .map(|(uid, name)| GroupCallParticipant {
                user_id: uid.clone(),
                user_name: name.clone(),
                is_muted: false,
            })
            .collect();

        // 通知所有参与者更新列表
        let conns = state.connections.read().await;
        for (pid, _) in &call_info.participants {
            if let Some((tx, _)) = conns.get(pid) {
                let participants_payload = GroupCallParticipantsPayload {
                    call_id: payload.call_id.clone(),
                    participants: participants.clone(),
                };
                let _ = tx.send(Message::Text(WsMessage::GroupCallParticipants(participants_payload).to_json().into()));
            }
        }
    } else {
        // 通话不存在
        let conns = state.connections.read().await;
        if let Some((tx, _)) = conns.get(user_id) {
            let error = WsMessage::Error(ErrorPayload {
                code: 404,
                message: "群组通话不存在".to_string(),
            });
            let _ = tx.send(Message::Text(error.to_json().into()));
        }
    }
}

/// 处理离开群组通话
async fn handle_group_call_leave(state: &AppState, user_id: &str, payload: GroupCallLeavePayload) {
    tracing::info!(
        "离开群组通话: call_id={}, user={}",
        payload.call_id, user_id
    );

    let mut group_calls = state.active_group_calls.write().await;
    if let Some(call_info) = group_calls.get_mut(&payload.call_id) {
        // 移除参与者
        call_info.participants.remove(user_id);

        if call_info.participants.is_empty() {
            // 所有人都离开了，销毁通话
            group_calls.remove(&payload.call_id);
            tracing::info!("群组通话已结束: call_id={}", payload.call_id);
        } else {
            // 通知剩余参与者更新列表
            let participants: Vec<GroupCallParticipant> = call_info
                .participants
                .iter()
                .map(|(uid, name)| GroupCallParticipant {
                    user_id: uid.clone(),
                    user_name: name.clone(),
                    is_muted: false,
                })
                .collect();

            let conns = state.connections.read().await;
            for (pid, _) in &call_info.participants {
                if let Some((tx, _)) = conns.get(pid) {
                    let participants_payload = GroupCallParticipantsPayload {
                        call_id: payload.call_id.clone(),
                        participants: participants.clone(),
                    };
                    let _ = tx.send(Message::Text(WsMessage::GroupCallParticipants(participants_payload).to_json().into()));
                }
            }
        }
    }
}
