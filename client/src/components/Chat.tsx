import { useState, useRef, useEffect } from 'react';
import { Input, Button, Empty, Avatar, Typography, Progress, message as antMessage } from 'antd';
import { SendOutlined, UserOutlined, PaperClipOutlined, FileOutlined, PhoneOutlined, TeamOutlined } from '@ant-design/icons';
import { useChatStore } from '@/stores/chat';
import { useAuthStore } from '@/stores/auth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { getInitiateCall, getCreateGroupCall } from '@/hooks/useWebRTC';
import api from '@/services/api';
import './Chat.css';

const { Text } = Typography;

function Chat() {
  const [inputValue, setInputValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentConversation = useChatStore((state) => state.currentConversation);
  const messages = useChatStore((state) =>
    currentConversation ? state.messages[currentConversation] || [] : [],
  );
  const conversations = useChatStore((state) => state.conversations);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { sendMessage, sendMarkRead } = useWebSocket();

  const currentConv = conversations.find((c) => c.id === currentConversation);

  // 发起语音通话
  const handleVoiceCall = () => {
    if (!currentConversation || !currentConv) return;

    if (currentConv.type === 'group') {
      // 群组通话
      const createGroup = getCreateGroupCall();
      if (createGroup) {
        createGroup(currentConversation, currentConv.name);
      } else {
        antMessage.warning('通话功能未就绪，请稍后重试');
      }
    } else {
      // 单人通话
      const initiate = getInitiateCall();
      if (initiate) {
        initiate(currentConversation, currentConv.name);
      } else {
        antMessage.warning('通话功能未就绪，请稍后重试');
      }
    }
  };

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 加载历史消息
  useEffect(() => {
    if (!currentConversation) return;
    const conv = useChatStore.getState().conversations.find((c) => c.id === currentConversation);
    if (!conv) return;

    const loadHistory = async () => {
      try {
        const resp = await api.get(`/messages/history/${currentConversation}/${conv.type}`, {
          params: { limit: 50 },
        });
        const history = resp.data.data;
        if (history && Array.isArray(history)) {
          useChatStore.getState().setMessages(
            currentConversation,
            history.reverse().map((msg: Record<string, unknown>) => ({
              id: msg.id as string,
              senderId: msg.sender_id as string,
              senderName: msg.sender_name as string | undefined,
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

  // 打开对话时发送已读回执
  useEffect(() => {
    if (!currentConversation) return;
    // 直接从 store 读取，避免依赖 currentConv 导致无限循环
    const conv = useChatStore.getState().conversations.find((c) => c.id === currentConversation);
    if (!conv) return;
    sendMarkRead(currentConversation, conv.type);
    useChatStore.getState().markAsRead(currentConversation);
  }, [currentConversation, sendMarkRead]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || !currentConversation || !currentConv) return;

    const receiverType = currentConv.type;
    const clientId = sendMessage(currentConversation, receiverType, text);

    // 乐观添加消息到本地
    useChatStore.getState().addMessage(currentConversation, {
      id: clientId,
      senderId: currentUserId || '',
      receiverId: currentConversation,
      receiverType,
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

  // 处理文件选择
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentConversation) return;

    // 检查文件大小 (最大 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      antMessage.error('文件大小不能超过 50MB');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // 创建 FormData
      const formData = new FormData();
      formData.append('file', file);

      // 上传文件
      const response = await api.post('/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percent);
          }
        },
      });

      const fileData = response.data.data;
      if (!fileData) {
        throw new Error('上传响应数据为空');
      }

      // 判断是图片还是文件
      const isImage = fileData.mime_type?.startsWith('image/');
      const messageType = isImage ? 'image' : 'file';

      // 构造消息内容
      const content = isImage
        ? `[图片] ${fileData.original_name}`
        : `[文件] ${fileData.original_name}`;

      // 构造 metadata
      const metadata = {
        fileId: fileData.id,
        fileName: fileData.original_name,
        fileSize: fileData.file_size,
        mimeType: fileData.mime_type,
        thumbnailPath: fileData.thumbnail_path,
      };

      // 发送文件消息
      const receiverType = currentConv?.type || 'user';
      const clientId = sendMessage(currentConversation, receiverType, content, messageType, metadata);

      // 乐观添加消息到本地
      useChatStore.getState().addMessage(currentConversation, {
        id: clientId,
        senderId: currentUserId || '',
        receiverId: currentConversation,
        receiverType,
        content,
        messageType: messageType as 'text' | 'image' | 'file' | 'system',
        metadata,
        isRead: false,
        createdAt: new Date().toISOString(),
        clientId,
      });

      antMessage.success('文件上传成功');
    } catch (err) {
      console.error('文件上传失败', err);
      antMessage.error('文件上传失败');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      // 清空文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 渲染消息内容
  const renderMessageContent = (msg: {
    messageType: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (msg.messageType === 'image' && msg.metadata?.fileId) {
      return (
        <div className="message-image">
          <img
            src={`/api/storage/${msg.metadata.fileId as string}/thumbnail`}
            alt={msg.metadata.fileName as string}
            onClick={() => window.open(`/api/storage/${msg.metadata?.fileId as string}`)}
            style={{ maxWidth: '200px', maxHeight: '200px', cursor: 'pointer' }}
          />
          <div className="message-content">{msg.content}</div>
        </div>
      );
    }

    if (msg.messageType === 'file' && msg.metadata?.fileId) {
      const fileSize = msg.metadata.fileSize as number;
      const sizeStr = fileSize > 1024 * 1024
        ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
        : `${(fileSize / 1024).toFixed(1)} KB`;

      return (
        <div className="message-file" onClick={() => window.open(`/api/storage/${msg.metadata?.fileId as string}`)}>
          <FileOutlined className="file-icon" />
          <div className="file-info">
            <div className="file-name">{msg.metadata.fileName as string}</div>
            <div className="file-size">{sizeStr}</div>
          </div>
        </div>
      );
    }

    return <div className="message-content">{msg.content}</div>;
  };

  // 判断是否是群聊
  const isGroup = currentConv?.type === 'group';

  // 时间分组：5分钟内的消息归为一组
  const shouldShowTimeDivider = (curr: string, prev?: string) => {
    if (!prev) return true;
    const diff = new Date(curr).getTime() - new Date(prev).getTime();
    return diff > 5 * 60 * 1000; // 5 分钟
  };

  // 格式化分组时间
  const formatDividerTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    if (isYesterday) return `昨天 ${time}`;
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + time;
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
        <Avatar
          icon={isGroup ? <TeamOutlined /> : <UserOutlined />}
          src={currentConv?.avatar}
          style={isGroup ? { backgroundColor: '#1890ff' } : undefined}
        />
        <div className="chat-header-info">
          <Text strong>{currentConv?.name || currentConversation}</Text>
          {isGroup && currentConv?.groupMemberCount && (
            <Text type="secondary" className="chat-header-sub">
              {currentConv.groupMemberCount} 位成员
            </Text>
          )}
          {!isGroup && currentConv?.status && (
            <Text type="secondary" className="chat-header-sub">
              {currentConv.status === 'online' ? '在线' : '离线'}
            </Text>
          )}
        </div>
        <Button
          type="text"
          icon={isGroup ? <TeamOutlined /> : <PhoneOutlined />}
          className="voice-call-btn"
          onClick={handleVoiceCall}
          title={isGroup ? '群组语音通话' : '语音通话'}
        />
      </div>

      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.map((msg, idx) => {
          const isOwn = msg.senderId === currentUserId;
          const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
          const showTime = shouldShowTimeDivider(msg.createdAt, prevMsg?.createdAt);
          // 群聊中，连续同一条消息不重复显示发送者
          const showSender = isGroup && !isOwn && (idx === 0 || messages[idx - 1]?.senderId !== msg.senderId);
          return (
            <div key={msg.id}>
              {showTime && (
                <div className="message-time-divider">
                  <span>{formatDividerTime(msg.createdAt)}</span>
                </div>
              )}
              <div className={`message-row ${isOwn ? 'message-own' : 'message-other'}`}>
                {!isOwn && (
                  <div className="message-avatar-col">
                    {showSender && <Avatar size="small" icon={<UserOutlined />} />}
                  </div>
                )}
                <div className={`message-bubble ${isOwn ? 'bubble-own' : 'bubble-other'}`}>
                  {isGroup && !isOwn && showSender && (
                    <div className="message-sender-name">{msg.senderName || '未知用户'}</div>
                  )}
                  {renderMessageContent(msg)}
                  <div className="message-meta">
                    <span className="message-time">
                      {new Date(msg.createdAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {isOwn && (
                      <span className={`message-status ${msg.isRead ? 'status-read' : 'status-sent'}`}>
                        {msg.isRead ? '已读' : '未读'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 上传进度 */}
      {uploading && (
        <div className="upload-progress">
          <Progress percent={uploadProgress} size="small" status="active" />
          <Text type="secondary">正在上传文件...</Text>
        </div>
      )}

      {/* 输入区域 */}
      <div className="chat-input">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <Button
          icon={<PaperClipOutlined />}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="发送文件"
        />
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
          disabled={!inputValue.trim() || uploading}
        >
          发送
        </Button>
      </div>
    </div>
  );
}

export default Chat;
