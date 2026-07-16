import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';

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

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

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
        // WS 连接就绪后，为当前会话发送已读回执（解决时序问题）
        {
          const currentConv = useChatStore.getState().currentConversation;
          if (currentConv) {
            console.log('[WS] 连接就绪，发送 mark_read', currentConv);
            wsRef.current?.send(JSON.stringify({
              type: 'mark_read',
              payload: { sender_id: currentConv, receiver_type: 'user' },
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
        const otherId = payload.sender_id === currentUserId ? payload.receiver_id : payload.sender_id;
        const isNewConversation = !useChatStore.getState().conversations.find((c) => c.id === otherId);

        addMessage(otherId, {
          id: payload.id,
          senderId: payload.sender_id,
          receiverId: payload.receiver_id,
          receiverType: payload.receiver_type as 'user' | 'group',
          content: payload.content,
          messageType: payload.message_type as 'text' | 'image' | 'file' | 'system',
          metadata: payload.metadata,
          isRead: false,
          createdAt: payload.created_at,
        });

        if (isNewConversation && payload.sender_id !== currentUserId && payload.sender_name) {
          updateConversationName(otherId, payload.sender_name);
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

      default:
        console.debug('[WS] 未知消息类型', msg.type);
    }
  };

  // 连接/断开生命周期 — 完全在 effect 内管理，避免 stale callback
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    // 使用 effect 作用域内的局部变量，避免 StrictMode 双重挂载之间的竞态条件。
    // 每个 effect 实例有自己的 cleanedUp，闭包捕获的都是各自独立的变量。
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

      clearTimers();

      // 直接连接后端（WebSocket 不受 CORS 限制，避免 Vite 代理问题）
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.DEV ? '127.0.0.1:3000' : window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/api/ws`;
      console.log('[WS] 连接中...', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cleanedUp) {
          ws.close();
          return;
        }
        console.log('[WS] 已连接');
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

        if (cleanedUp) return;

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

    connect();

    return () => {
      cleanedUp = true;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, token]);

  // 发送消息
  const send = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendMessage = useCallback(
    (receiverId: string, receiverType: string, content: string, messageType = 'text', metadata?: Record<string, unknown>) => {
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
