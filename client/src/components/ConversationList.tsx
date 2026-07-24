import { useState, useCallback, useRef, useEffect } from 'react';
import { List, Avatar, Badge, Input, Spin, Empty } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  SearchOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/stores/chat';
import { useContactsStore } from '@/stores/contacts';
import { useNavStore } from '@/stores/nav';
import api from '@/services/api';
import { formatTime } from '@/utils/format';
import type { Contact } from '@/stores/contacts';
import './ConversationList.css';

function ConversationList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();
  const conversations = useChatStore((state) => state.conversations);
  const currentConversation = useChatStore((state) => state.currentConversation);
  const setCurrentConversation = useChatStore((state) => state.setCurrentConversation);
  const addConversation = useChatStore((state) => state.addConversation);
  const setActivePanel = useNavStore((state) => state.setActivePanel);
  const storeContacts = useContactsStore((state) => state.contacts);

  // 合并搜索结果的实时在线状态
  const liveSearchResults = searchResults.map((r) => {
    const live = storeContacts.find((s) => s.id === r.id);
    return live ? { ...r, status: live.status } : r;
  });

  // 搜索用户
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const resp = await api.get('/auth/search', { params: { q: value.trim(), limit: 10 } });
        const users = (resp.data.data || []).map((u: Record<string, unknown>) => ({
          id: u.id as string,
          account: u.account as string,
          name: (u.name as string) || '',
          avatar: u.avatar_url as string | undefined,
          department: (u.department as string) || '',
          status: (u.status as string) || 'offline',
        }));
        setSearchResults(users);
      } catch (err) {
        console.error('搜索用户失败', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // 点击搜索结果 → 创建会话并切换
  const handleUserSelect = useCallback((contact: Contact) => {
    addConversation({
      id: contact.id,
      name: contact.name || contact.account,
      avatar: contact.avatar,
      unreadCount: 0,
      type: 'user',
      status: contact.status,
    });
    setCurrentConversation(contact.id);
    setSearchQuery('');
    setSearchResults([]);
    setActivePanel('messages');
    navigate('/');
  }, [addConversation, setCurrentConversation, setActivePanel, navigate]);

  // 点击会话
  const handleConversationClick = (convId: string) => {
    setCurrentConversation(convId);
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  return (
    <div className="conversation-panel">
      {/* 标题 */}
      <div className="panel-header">
        <h2>消息</h2>
      </div>

      {/* 搜索框 */}
      <div className="panel-search">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索用户..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          allowClear
        />
        {searching && <Spin size="small" className="panel-search-spinner" />}
      </div>

      {/* 搜索结果 */}
      {searchQuery && (
        <div className="panel-search-results">
          {liveSearchResults.length === 0 && !searching ? (
            <div className="panel-empty">
              <Empty description="未找到用户" />
            </div>
          ) : (
            <List
              dataSource={liveSearchResults}
              renderItem={(contact: Contact) => (
                <div
                  className="conv-item"
                  onClick={() => handleUserSelect(contact)}
                >
                  <Avatar icon={<UserOutlined />} />
                  <div className="conv-info">
                    <div className="conv-name">{contact.name || contact.account}</div>
                    <div className="conv-preview">{contact.account}</div>
                  </div>
                  <div className={`status-dot ${contact.status}`} />
                </div>
              )}
            />
          )}
        </div>
      )}

      {/* 会话列表 */}
      {!searchQuery && (
        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="panel-empty">
              <Empty description="暂无会话" />
            </div>
          ) : (
            <List
              dataSource={[...conversations].sort((a, b) => {
                // 归档（已解散）会话置底
                if (a.archived && !b.archived) return 1;
                if (!a.archived && b.archived) return -1;
                // 系统群组置顶
                if (a.isSystem && !b.isSystem) return -1;
                if (!a.isSystem && b.isSystem) return 1;
                return 0;
              })}
              renderItem={(conv) => {
                const isGroup = conv.type === 'group';
                const isArchived = conv.archived === true;
                return (
                  <div
                    className={`conv-item ${conv.id === currentConversation ? 'active' : ''} ${isArchived ? 'archived' : ''}`}
                    onClick={() => handleConversationClick(conv.id)}
                  >
                    {isGroup ? (
                      <div className="conv-avatar-wrap">
                        <Avatar
                          icon={<TeamOutlined />}
                          style={{
                            backgroundColor: isArchived ? '#bfbfbf' : '#1890ff',
                          }}
                          size={40}
                        />
                      </div>
                    ) : (
                      <Badge count={conv.unreadCount} size="small">
                        <div className="conv-avatar-wrap">
                          <Avatar
                            icon={<UserOutlined />}
                            src={conv.avatar}
                            size={40}
                          />
                          {conv.status && (
                            <div className={`conv-status-dot ${conv.status}`} />
                          )}
                        </div>
                      </Badge>
                    )}
                    <div className="conv-info">
                      <div className="conv-name">
                        {conv.name}
                        {conv.isSystem && (
                          <CrownOutlined style={{ color: '#faad14', marginLeft: 4, fontSize: 12 }} />
                        )}
                        {isArchived && (
                          <span style={{ color: '#bfbfbf', marginLeft: 4, fontSize: 12 }}>已解散</span>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <div className="conv-preview">
                          {isGroup && conv.lastMessage.senderName
                            ? `${conv.lastMessage.senderName}: ${conv.lastMessage.content?.slice(0, 20)}`
                            : conv.lastMessage.content?.slice(0, 30)}
                        </div>
                      )}
                    </div>
                    {conv.lastMessage && (
                      <div className="conv-time">
                        {formatTime(conv.lastMessage.createdAt)}
                      </div>
                    )}
                  </div>
                );
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default ConversationList;
