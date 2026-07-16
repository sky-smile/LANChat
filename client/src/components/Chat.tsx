import { useState, useRef, useEffect } from 'react';
import { Input, Button, Empty, Avatar, Typography } from 'antd';
import { SendOutlined, UserOutlined } from '@ant-design/icons';
import { useChatStore } from '@/stores/chat';
import { useAuthStore } from '@/stores/auth';
import { useWebSocket } from '@/hooks/useWebSocket';
import api from '@/services/api';
import './Chat.css';

const { Text } = Typography;

function Chat() {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentConversation = useChatStore((state) => state.currentConversation);
  const messages = useChatStore((state) =>
    currentConversation ? state.messages[currentConversation] || [] : [],
  );
  const conversations = useChatStore((state) => state.conversations);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { sendMessage } = useWebSocket();

  const currentConv = conversations.find((c) => c.id === currentConversation);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 加载历史消息
  useEffect(() => {
    if (!currentConversation) return;

    const loadHistory = async () => {
      try {
        const resp = await api.get(`/messages/history/${currentConversation}/user`, {
          params: { limit: 50 },
        });
        const history = resp.data.data;
        if (history && Array.isArray(history)) {
          useChatStore.getState().setMessages(
            currentConversation,
            history.reverse().map((msg: Record<string, unknown>) => ({
              id: msg.id as string,
              senderId: msg.sender_id as string,
              receiverId: msg.receiver_id as string,
              receiverType: msg.receiver_type as 'user' | 'group',
              content: (msg.content as string) || '',
              messageType: msg.message_type as 'text' | 'image' | 'file' | 'system',
              metadata: msg.metadata as Record<string, unknown> | undefined,
              isRead: msg.is_read as boolean,
              createdAt: msg.created_at as string,
            })),
          );
        }
      } catch (err) {
        console.error('加载历史消息失败', err);
      }
    };

    loadHistory();
  }, [currentConversation]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || !currentConversation) return;

    const clientId = sendMessage(currentConversation, 'user', text);

    // 乐观添加消息到本地
    useChatStore.getState().addMessage(currentConversation, {
      id: clientId,
      senderId: currentUserId || '',
      receiverId: currentConversation,
      receiverType: 'user',
      content: text,
      messageType: 'text',
      isRead: false,
      createdAt: new Date().toISOString(),
      clientId,
    });

    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!currentConversation) {
    return (
      <div className="chat-container">
        <Empty description="选择一个聊天开始对话" />
      </div>
    );
  }

  return (
    <div className="chat-container">
      {/* 聊天头部 */}
      <div className="chat-header">
        <Avatar icon={<UserOutlined />} />
        <div className="chat-header-info">
          <Text strong>{currentConv?.name || currentConversation}</Text>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.map((msg) => {
          const isOwn = msg.senderId === currentUserId;
          return (
            <div key={msg.id} className={`message-row ${isOwn ? 'message-own' : 'message-other'}`}>
              {!isOwn && <Avatar size="small" icon={<UserOutlined />} />}
              <div className={`message-bubble ${isOwn ? 'bubble-own' : 'bubble-other'}`}>
                <div className="message-content">{msg.content}</div>
                <div className="message-time">
                  {new Date(msg.createdAt).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="chat-input">
        <Input.TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          autoSize={{ minRows: 1, maxRows: 4 }}
          className="chat-textarea"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={!inputValue.trim()}
        >
          发送
        </Button>
      </div>
    </div>
  );
}

export default Chat;
