import { useState, useRef, useEffect } from 'react';
import { Input, Button, Avatar, Typography, Progress, message as antMessage, Dropdown } from 'antd';
import { SendOutlined, UserOutlined, PaperClipOutlined, FileOutlined, PhoneOutlined, TeamOutlined, CopyOutlined, SearchOutlined, ContactsOutlined, CommentOutlined, SettingOutlined } from '@ant-design/icons';
import { useChatStore } from '@/stores/chat';
import { useAuthStore } from '@/stores/auth';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWebRTCCapabilities } from '@/hooks/useWebRTC';
import api from '@/services/api';
import { getFileUrl } from '@/utils/format';
import GroupSettings from './GroupSettings';
import './Chat.css';

const { Text } = Typography;

function Chat() {
  const [inputValue, setInputValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const oldestMsgTimeRef = useRef<string | null>(null);

  const currentConversation = useChatStore((state) => state.currentConversation);
  const messages = useChatStore((state) =>
    currentConversation ? state.messages[currentConversation] || [] : [],
  );
  const conversations = useChatStore((state) => state.conversations);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [isGroupMember, setIsGroupMember] = useState<boolean | null>(null);
  const { sendMessage, sendMarkRead } = useWebSocket();
  const webRTC = useWebRTCCapabilities();

  const currentConv = conversations.find((c) => c.id === currentConversation);
  const isGroup = currentConv?.type === 'group';

  // 发起语音通话
  const handleVoiceCall = () => {
    if (!currentConversation || !currentConv || !webRTC) return;

    if (currentConv.type === 'group') {
      // 群组通话
      webRTC.createGroupCall(currentConversation, currentConv.name);
    } else {
      // 单人通话
      webRTC.initiateCall(currentConversation, currentConv.name);
    }
  };

  // 智能滚动：检测用户是否在底部附近，以及是否滚动到顶部
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 100;
    isNearBottomRef.current = 
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    
    // 滚动到顶部时加载更多历史消息
    if (container.scrollTop < 50 && !loadingMore && hasMore) {
      loadOlderMessages();
    }
  };

  // 加载更早的历史消息
  const loadOlderMessages = async () => {
    if (!currentConversation || loadingMore || !hasMore) return;
    const conv = useChatStore.getState().conversations.find((c) => c.id === currentConversation);
    if (!conv) return;

    setLoadingMore(true);
    try {
      const container = messagesContainerRef.current;
      const prevScrollHeight = container?.scrollHeight || 0;

      const resp = await api.get(`/messages/history/${currentConversation}/${conv.type}`, {
        params: { limit: 50, before: oldestMsgTimeRef.current },
      });
      const history = resp.data.data;
      if (history && Array.isArray(history) && history.length > 0) {
        const mapped = history.reverse().map((msg: Record<string, unknown>) => ({
          id: msg.id as string,
          senderId: msg.sender_id as string,
          senderName: (msg.sender_display_name as string) || (msg.sender_name as string) || undefined,
          receiverId: msg.receiver_id as string,
          receiverType: msg.receiver_type as 'user' | 'group',
          content: (msg.content as string) || '',
          messageType: msg.message_type as 'text' | 'image' | 'file' | 'system',
          metadata: msg.metadata as Record<string, unknown> | undefined,
          isRead: msg.is_read as boolean,
          createdAt: msg.created_at as string,
        }));
        
        oldestMsgTimeRef.current = mapped[0].createdAt;
        useChatStore.getState().prependMessages(currentConversation, mapped);
        
        // 保持滚动位置不变
        if (container) {
          requestAnimationFrame(() => {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - prevScrollHeight;
          });
        }
        
        if (history.length < 50) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('加载更多历史消息失败', err);
    } finally {
      setLoadingMore(false);
    }
  };

  // 自动滚动：仅当用户在底部时滚动
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 切换会话时滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView();
    isNearBottomRef.current = true;
  }, [currentConversation]);

  // 加载历史消息
  useEffect(() => {
    if (!currentConversation) return;
    const conv = useChatStore.getState().conversations.find((c) => c.id === currentConversation);
    if (!conv) return;

    // 重置分页状态
    setHasMore(true);
    oldestMsgTimeRef.current = null;

    const loadHistory = async () => {
      try {
        const resp = await api.get(`/messages/history/${currentConversation}/${conv.type}`, {
          params: { limit: 50 },
        });
        const history = resp.data.data;
        if (history && Array.isArray(history)) {
          const mapped = history.reverse().map((msg: Record<string, unknown>) => ({
            id: msg.id as string,
            senderId: msg.sender_id as string,
            senderName: (msg.sender_display_name as string) || (msg.sender_name as string) || undefined,
            receiverId: msg.receiver_id as string,
            receiverType: msg.receiver_type as 'user' | 'group',
            content: (msg.content as string) || '',
            messageType: msg.message_type as 'text' | 'image' | 'file' | 'system',
            metadata: msg.metadata as Record<string, unknown> | undefined,
            isRead: msg.is_read as boolean,
            createdAt: msg.created_at as string,
          }));
          useChatStore.getState().setMessages(currentConversation, mapped);
          
          // 记录最早消息时间，用于分页
          if (mapped.length > 0) {
            oldestMsgTimeRef.current = mapped[0].createdAt;
          }
          if (history.length < 50) {
            setHasMore(false);
          }
        }
      } catch (err) {
        console.error('加载历史消息失败', err);
      }
    };

    // 如果是群组会话且名称为占位符，获取群组真实名称
    const fetchGroupInfo = async () => {
      if (conv.type === 'group' && (conv.name === '加载中...' || conv.name.length === 36)) {
        try {
          const resp = await api.get(`/groups/${currentConversation}`);
          const group = resp.data.data;
          if (group?.name) {
            useChatStore.getState().updateConversationName(currentConversation, group.name);
            if (group.member_count) {
              // 更新成员数量
              const store = useChatStore.getState();
              const updated = store.conversations.map((c) =>
                c.id === currentConversation
                  ? { ...c, groupMemberCount: group.member_count }
                  : c,
              );
              useChatStore.setState({ conversations: updated });
            }
          }
        } catch (err) {
          console.error('获取群组信息失败', err);
        }
      }
    };

    loadHistory();
    fetchGroupInfo();
  }, [currentConversation]);

  // 检查管理员是否为当前群组成员
  useEffect(() => {
    if (!currentConversation) {
      setIsGroupMember(null);
      return;
    }
    const conv = useChatStore.getState().conversations.find((c) => c.id === currentConversation);
    if (!conv || conv.type !== 'group') {
      setIsGroupMember(null);
      return;
    }
    if (!isAdmin) {
      setIsGroupMember(true);
      return;
    }
    // 管理员检查是否为群成员
    api.get(`/groups/${currentConversation}/members`).then((resp) => {
      const members = resp.data.data || [];
      const found = members.some((m: Record<string, unknown>) => m.id === currentUserId);
      setIsGroupMember(found);
    }).catch(() => setIsGroupMember(true));
  }, [currentConversation, isAdmin, currentUserId]);

  // 打开对话时发送已读回执，以及页面重新可见时刷新已读状态
  useEffect(() => {
    if (!currentConversation) return;

    const sendReadForCurrent = () => {
      // 直接从 store 读取，避免依赖 currentConv 导致无限循环
      const conv = useChatStore.getState().conversations.find((c) => c.id === currentConversation);
      if (!conv) return;
      sendMarkRead(currentConversation, conv.type);
      useChatStore.getState().markAsRead(currentConversation);
    };

    // 打开会话时立即发送
    sendReadForCurrent();

    // 页面从隐藏变为可见时，重新发送已读（处理切换标签页返回的场景）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendReadForCurrent();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentConversation, sendMarkRead]);

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text || !currentConversation || !currentConv) return;
    // 管理员非群成员禁止发送
    if (isGroup && isAdmin && isGroupMember === false) return;

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
    // 发送后总是滚动到底部
    isNearBottomRef.current = true;
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
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
      const fileId = msg.metadata.fileId as string;
      return (
        <div className="message-image">
          <img
            src={getFileUrl(fileId, 'thumbnail')}
            alt={msg.metadata.fileName as string}
            onClick={() => window.open(getFileUrl(fileId))}
            style={{ maxWidth: '200px', maxHeight: '200px', cursor: 'pointer' }}
          />
          <div className="message-content">{msg.content}</div>
        </div>
      );
    }

    if (msg.messageType === 'file' && msg.metadata?.fileId) {
      const fileId = msg.metadata.fileId as string;
      const fileSize = msg.metadata.fileSize as number;
      const sizeStr = fileSize > 1024 * 1024
        ? `${(fileSize / (1024 * 1024)).toFixed(1)} MB`
        : `${(fileSize / 1024).toFixed(1)} KB`;

      return (
        <div className="message-file" onClick={() => window.open(getFileUrl(fileId))}>
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

  // 复制消息文本
  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      antMessage.success('已复制');
    }).catch(() => {
      antMessage.error('复制失败');
    });
  };

  // 消息右键菜单
  const getMessageMenuItems = (msg: { content: string; messageType: string }) => [
    {
      key: 'copy',
      icon: <CopyOutlined />,
      label: '复制',
      onClick: () => handleCopyMessage(msg.content),
    },
  ];

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
        <div className="chat-empty-state">
          <div className="chat-empty-icon">
            <CommentOutlined />
          </div>
          <h3>欢迎使用 LANChat</h3>
          <p>选择一个聊天开始对话，或搜索联系人发起新会话</p>
          <div className="chat-empty-actions">
            <Button icon={<SearchOutlined />} onClick={() => {
              const searchInput = document.querySelector('.sidebar-search input') as HTMLInputElement;
              searchInput?.focus();
            }}>
              搜索联系人
            </Button>
            <Button icon={<ContactsOutlined />} onClick={() => window.location.href = '/contacts'}>
              查看通讯录
            </Button>
          </div>
        </div>
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
        {isGroup && isAdmin && (
          <Button
            type="text"
            icon={<SettingOutlined />}
            className="voice-call-btn"
            onClick={() => setGroupSettingsOpen(true)}
            title="群组设置"
          />
        )}
      </div>

      {/* 消息列表 */}
      <div className="chat-messages" ref={messagesContainerRef} onScroll={handleScroll}>
        {loadingMore && (
          <div style={{ textAlign: 'center', padding: '8px', color: '#999', fontSize: '12px' }}>
            加载更多消息...
          </div>
        )}
        {!hasMore && messages.length > 0 && (
          <div style={{ textAlign: 'center', padding: '8px', color: '#999', fontSize: '12px' }}>
            没有更多消息了
          </div>
        )}
        {messages.map((msg, idx) => {
          const isOwn = msg.senderId === currentUserId;
          const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
          const showTime = shouldShowTimeDivider(msg.createdAt, prevMsg?.createdAt);
          return (
            <div key={msg.id} className={`message-wrapper ${isOwn ? 'wrapper-own' : 'wrapper-other'}`}>
              {showTime && (
                <div className="message-time-divider">
                  <span>{formatDividerTime(msg.createdAt)}</span>
                </div>
              )}
              <div className={`message-row ${isOwn ? 'message-own' : 'message-other'}`}>
                {!isOwn && (
                  <div className="message-avatar-col">
                    <Avatar size="small" icon={<UserOutlined />} />
                  </div>
                )}
                <Dropdown menu={{ items: getMessageMenuItems(msg) }} trigger={['contextMenu']}>
                  <div className={`message-bubble ${isOwn ? 'bubble-own' : 'bubble-other'}`}>
                    {isGroup && !isOwn && (
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
                </Dropdown>
                {isOwn && (
                  <div className="message-avatar-col">
                    <Avatar size="small" icon={<UserOutlined />} />
                  </div>
                )}
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

      {/* 管理员非成员提示 */}
      {isGroup && isAdmin && isGroupMember === false && (
        <div style={{ padding: '12px 16px', textAlign: 'center', background: '#fff7e6', borderTop: '1px solid #ffe58f' }}>
          <Text type="warning">您不是该群组的成员，无法发送消息。请在群组设置中添加自己为成员。</Text>
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
          disabled={uploading || (isGroup && isAdmin && isGroupMember === false)}
          title="发送文件"
        />
        <Input.TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isGroup && isAdmin && isGroupMember === false ? '您不是群组成员，无法发送消息' : '输入消息...'}
          autoSize={{ minRows: 1, maxRows: 4 }}
          className="chat-textarea"
          disabled={isGroup && isAdmin && isGroupMember === false}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={!inputValue.trim() || uploading || (isGroup && isAdmin && isGroupMember === false)}
        >
          发送
        </Button>
      </div>

      {/* 群组设置弹窗 */}
      {isGroup && currentConversation && (
        <GroupSettings
          groupId={currentConversation}
          open={groupSettingsOpen}
          onClose={() => setGroupSettingsOpen(false)}
          onGroupNameChange={(name) => {
            useChatStore.getState().updateConversationName(currentConversation, name);
          }}
        />
      )}
    </div>
  );
}

export default Chat;
