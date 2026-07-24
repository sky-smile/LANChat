import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useContactsStore } from '@/stores/contacts';
import { dispatchCallSignaling } from './callSignalingBus';
import { playMessageSound } from '@/utils/notification';
import api from '@/services/api';

// WebSocket 消息类型
interface WsMessage {
  type: string;
  payload?: unknown;
}

interface NewMessagePayload {
  id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string;
  receiver_type: string;
  content: string;
  message_type: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface MessageAckPayload {
  client_msg_id: string;
  server_msg_id: string;
  created_at: string;
}

interface PresencePayload {
  user_id: string;
  status: string;
}

interface ReadReceiptPayload {
  reader_id: string;
  sender_id: string;
  receiver_type: string;
  read_at: string;
}

interface TypingPayload {
  sender_id: string;
  receiver_id: string;
  receiver_type: string;
}

// 重连配置
const RECONNECT_DELAY = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;
const PING_INTERVAL = 30000;

// 待发送消息队列
interface QueuedMessage {
  msg: WsMessage;
  timestamp: number;
}

export function useWebSocket(externalWsRef?: React.MutableRefObject<WebSocket | null>) {
  const internalWsRef = useRef<WebSocket | null>(null);
  const wsRef = externalWsRef || internalWsRef;
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const messageQueueRef = useRef<QueuedMessage[]>([]);
  // 防止 StrictMode 双重挂载导致的重复连接
  const connectSeqRef = useRef(0);

  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessageAck = useChatStore((state) => state.updateMessageAck);
  const updateContactStatus = useChatStore((state) => state.updateContactStatus);
  const updateConversationName = useChatStore((state) => state.updateConversationName);
  const updateUserStatus = useAuthStore((state) => state.updateUserStatus);

  // 处理消息的 ref，避免 stale closure
  const handleMessageRef = useRef<(msg: WsMessage) => void>();



  // 更新消息处理器
  handleMessageRef.current = (msg: WsMessage) => {
    switch (msg.type) {
      case 'auth_ok':
        console.log('[WS] 认证成功', msg.payload);
        reconnectAttemptsRef.current = 0;
        updateUserStatus('online');
        // 刷新待发送消息队列
        flushMessageQueue();
        // WS 连接就绪后，为当前会话发送已读回执
        {
          const currentConv = useChatStore.getState().currentConversation;
          if (currentConv) {
            const conv = useChatStore.getState().conversations.find((c) => c.id === currentConv);
            const rType = conv?.type || 'user';
            console.log('[WS] 连接就绪，发送 mark_read', currentConv, rType);
            wsRef.current?.send(JSON.stringify({
              type: 'mark_read',
              payload: { sender_id: currentConv, receiver_type: rType },
            }));
          }
        }
        break;

      case 'auth_error':
        console.error('[WS] 认证失败', msg.payload);
        break;

      case 'new_message': {
        const payload = msg.payload as NewMessagePayload;
        const currentUserId = useAuthStore.getState().user?.id;
        // 群组消息：会话 ID 是 receiver_id（群组 ID）
        // 私聊消息：会话 ID 是对方 ID
        const convId = payload.receiver_type === 'group'
          ? payload.receiver_id
          : (payload.sender_id === currentUserId ? payload.receiver_id : payload.sender_id);

        // 判断是否正在查看该会话：当前会话匹配 + 页面可见
        const currentConv = useChatStore.getState().currentConversation;
        const isVisible = document.visibilityState === 'visible';
        const isViewingConv = currentConv === convId && isVisible;

        addMessage(convId, {
          id: payload.id,
          senderId: payload.sender_id,
          senderName: payload.sender_name,
          receiverId: payload.receiver_id,
          receiverType: payload.receiver_type as 'user' | 'group',
          content: payload.content,
          messageType: payload.message_type as 'text' | 'image' | 'file' | 'system',
          metadata: payload.metadata,
          // 如果正在查看该会话，直接标记为已读
          isRead: isViewingConv,
          createdAt: payload.created_at,
        });

        // 私聊新会话时更新对方名称
        if (payload.receiver_type !== 'group' && payload.sender_id !== currentUserId && payload.sender_name) {
          const isNewConversation = !useChatStore.getState().conversations.find((c) => c.id === convId);
          if (isNewConversation) {
            updateConversationName(convId, payload.sender_name);
          }
        }

        // 群组新会话时获取群组真实名称
        if (payload.receiver_type === 'group') {
          const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
          if (conv && (conv.name === '加载中...' || conv.name.length === 36)) {
            api.get(`/groups/${convId}`).then((resp) => {
              const group = resp.data.data;
              if (group?.name) {
                useChatStore.getState().updateConversationName(convId, group.name);
              }
            }).catch(() => {});
          }
        }

        // 非自己消息
        if (payload.sender_id !== currentUserId) {
          if (isViewingConv) {
            // 正在查看该会话：立即发送已读通知给发送者
            const conv = useChatStore.getState().conversations.find((c) => c.id === convId);
            wsRef.current?.send(JSON.stringify({
              type: 'mark_read',
              payload: {
                sender_id: payload.sender_id,
                receiver_type: conv?.type || payload.receiver_type,
              },
            }));
          } else {
            // 未在查看该会话：播放提示音
            playMessageSound();
          }
        }

        break;
      }

      case 'message_ack': {
        const ack = msg.payload as MessageAckPayload;
        updateMessageAck(ack.client_msg_id, ack.server_msg_id, ack.created_at);
        break;
      }

      case 'presence': {
        const presence = msg.payload as PresencePayload;
        updateContactStatus(presence.user_id, presence.status);
        // 同步更新联系人列表的在线状态
        useContactsStore.getState().updateContactStatus(
          presence.user_id,
          presence.status as 'online' | 'away' | 'busy' | 'offline',
        );
        break;
      }

      case 'typing': {
        const typing = msg.payload as TypingPayload;
        console.log(`[WS] ${typing.sender_id} 正在输入...`);
        break;
      }

      case 'read_receipt': {
        const receipt = msg.payload as ReadReceiptPayload;
        // 标记我发给该用户的消息为已读
        useChatStore.getState().markConversationRead(receipt.reader_id);
        break;
      }

      case 'pong':
        break;

      case 'error':
        console.error('[WS] 错误', msg.payload);
        break;

      // 通话信令消息：转发给 useWebRTC 处理
      case 'call_invite':
      case 'call_status':
      case 'call_offer':
      case 'call_answer':
      case 'call_ice':
      // 群组通话信令
      case 'group_call_participants':
      case 'group_call_ended':
        console.log('[WS] 收到通话信令:', msg.type, msg.payload);
        dispatchCallSignaling(msg);
        break;

      // 群组通话邀请通知
      case 'group_call_invite': {
        const invite = msg.payload as {
          call_id: string;
          group_id: string;
          group_name: string;
          caller_id: string;
          caller_name: string;
        };
        console.log('[WS] 收到群组通话邀请:', invite);
        // 将邀请也转发给信令总线，由 useWebRTC 或 UI 组件处理
        dispatchCallSignaling(msg);
        break;
      }

      default:
        console.debug('[WS] 未知消息类型', msg.type);
    }
  };

  // 连接/断开生命周期 — 完全在 effect 内管理，避免 stale callback
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    // 递增序列号，用于 StrictMode 环境下区分新旧 effect 实例。
    // cleanup 设置 cleanedUp 后，旧实例的 connect 就不会再执行。
    connectSeqRef.current += 1;
    const mySeq = connectSeqRef.current;
    let cleanedUp = false;
    reconnectAttemptsRef.current = 0;

    function clearTimers() {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = undefined;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
    }

    function connect() {
      if (cleanedUp) return;
      // 确保只有最新的 effect 实例可以连接
      if (connectSeqRef.current !== mySeq) return;

      clearTimers();

      // 通过 Vite 代理连接 WebSocket（Vite proxy 已配置 ws: true）
      // 在 VS Code Remote 环境中，浏览器无法直接访问后端端口，需经由 Vite 代理转发
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.DEV 
        ? window.location.host  // 使用当前页面地址（Vite 代理会转发 /api/ws）
        : (import.meta.env.VITE_API_URL 
          ? new URL(import.meta.env.VITE_API_URL).host 
          : window.location.host);
      const wsUrl = `${wsProtocol}//${wsHost}/api/ws`;
      console.log('[WS] 连接中...', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cleanedUp || connectSeqRef.current !== mySeq) {
          ws.close();
          return;
        }
        console.log('[WS] 已连接');
        reconnectAttemptsRef.current = 0;
        const authMsg: WsMessage = {
          type: 'auth',
          payload: { token },
        };
        ws.send(JSON.stringify(authMsg));

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsMessage;
          handleMessageRef.current?.(msg);
        } catch (e) {
          console.error('[WS] 解析消息失败', e);
        }
      };

      ws.onclose = (event) => {
        console.log('[WS] 连接关闭', event.code, event.reason);
        clearTimers();

        if (cleanedUp || connectSeqRef.current !== mySeq) return;

        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          const delay = RECONNECT_DELAY * Math.min(reconnectAttemptsRef.current, 5);
          console.log(`[WS] ${delay}ms 后重连 (第 ${reconnectAttemptsRef.current} 次)`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] 错误', error);
      };
    }

    // 延迟连接，让 StrictMode 完成双重挂载/卸载周期后再连接
    const connectTimer = setTimeout(() => {
      if (!cleanedUp && connectSeqRef.current === mySeq) {
        connect();
      }
    }, 100);

    return () => {
      cleanedUp = true;
      clearTimers();
      clearTimeout(connectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, token]);

  // 刷新待发送消息队列
  const flushMessageQueue = useCallback(() => {
    const queue = messageQueueRef.current;
    if (queue.length === 0) return;
    console.log(`[WS] 刷新消息队列，共 ${queue.length} 条待发送`);
    const toSend = [...queue];
    messageQueueRef.current = [];
    for (const item of toSend) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(item.msg));
      } else {
        // 仍然未连接，放回队列
        messageQueueRef.current.push(item);
      }
    }
  }, []);

  // 发送消息（带队列支持）
  const send = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      // 未连接时入队，连接成功后自动发送
      console.log('[WS] 未连接，消息入队');
      messageQueueRef.current.push({ msg, timestamp: Date.now() });
    }
  }, []);

  const sendMessage = useCallback(
    (receiverId: string, receiverType: string, content: string, messageType = 'text', metadata?: Record<string, unknown>): string => {
      const clientId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      send({
        type: 'send_message',
        payload: {
          client_msg_id: clientId,
          receiver_id: receiverId,
          receiver_type: receiverType,
          content,
          message_type: messageType,
          metadata,
        },
      });
      return clientId;
    },
    [send],
  );

  const sendTyping = useCallback(
    (receiverId: string, receiverType: string) => {
      send({
        type: 'typing',
        payload: {
          receiver_id: receiverId,
          receiver_type: receiverType,
        },
      });
    },
    [send],
  );

  const sendMarkRead = useCallback(
    (senderId: string, receiverType = 'user') => {
      send({
        type: 'mark_read',
        payload: {
          sender_id: senderId,
          receiver_type: receiverType,
        },
      });
    },
    [send],
  );

  return {
    send,
    sendMessage,
    sendTyping,
    sendMarkRead,
  };
}
