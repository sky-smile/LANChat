import { useState, useCallback, useRef, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Badge, Input, List, Spin } from 'antd';
import {
  MessageOutlined,
  ContactsOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  SearchOutlined,
  TeamOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import api from '@/services/api';
import { formatTime } from '@/utils/format';
import type { Contact } from '@/stores/contacts';
import './Sidebar.css';

const { Sider } = Layout;

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const conversations = useChatStore((state) => state.conversations);
  const currentConversation = useChatStore((state) => state.currentConversation);
  const setCurrentConversation = useChatStore((state) => state.setCurrentConversation);
  const addConversation = useChatStore((state) => state.addConversation);

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
          username: u.username as string,
          displayName: (u.display_name as string) || '',
          avatar: u.avatar_url as string | undefined,
          department: u.department as string | undefined,
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
      name: contact.displayName || contact.username,
      avatar: contact.avatar,
      unreadCount: 0,
      type: 'user',
      status: contact.status,
    });
    setCurrentConversation(contact.id);
    setSearchQuery('');
    setSearchResults([]);
    navigate('/');
  }, [addConversation, setCurrentConversation, navigate]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const menuItems = [
    {
      key: '/',
      icon: <MessageOutlined />,
      label: '消息',
    },
    {
      key: '/contacts',
      icon: <ContactsOutlined />,
      label: '联系人',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
    ...(user?.role === 'admin'
      ? [
          {
            key: '/admin',
            icon: <SafetyOutlined />,
            label: '管理',
          },
        ]
      : []),
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        logout();
        navigate('/login');
      },
    },
  ];

  const handleConversationClick = (convId: string) => {
    setCurrentConversation(convId);
  };

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      className="app-sidebar"
      width={280}
    >
      <div className="sidebar-header">
        <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
          <div className="sidebar-user">
            <Avatar size={collapsed ? 32 : 40} icon={<UserOutlined />} />
            {!collapsed && user && (
              <div className="user-info">
                <div className="username">{user.displayName || user.username}</div>
                <div className="status">{user.status === 'online' ? '在线' : '离线'}</div>
              </div>
            )}
          </div>
        </Dropdown>
      </div>

      {!collapsed && (
        <div className="sidebar-search">
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索用户..."
            size="small"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            allowClear
          />
          {searching && <Spin size="small" className="search-spinner" />}
        </div>
      )}

      {!collapsed && searchQuery && (
        <div className="search-results">
          {searchResults.length === 0 && !searching ? (
            <div className="conversation-empty">未找到用户</div>
          ) : (
            <List
              dataSource={searchResults}
              renderItem={(contact: Contact) => (
                <div
                  className="conversation-item"
                  onClick={() => handleUserSelect(contact)}
                >
                  <Avatar icon={<UserOutlined />} />
                  <div className="conversation-info">
                    <div className="conversation-name">{contact.displayName || contact.username}</div>
                    <div className="conversation-preview">{contact.username}</div>
                  </div>
                  <div className={`status-dot ${contact.status}`} />
                </div>
              )}
            />
          )}
        </div>
      )}

      {!collapsed && location.pathname === '/' && (
        <div className="conversation-list">
          {conversations.length === 0 ? (
            <div className="conversation-empty">暂无会话</div>
          ) : (
            <List
              dataSource={conversations}
              renderItem={(conv) => {
                const isGroup = conv.type === 'group';
                return (
                  <div
                    className={`conversation-item ${conv.id === currentConversation ? 'active' : ''}`}
                    onClick={() => handleConversationClick(conv.id)}
                  >
                    <Badge count={conv.unreadCount} size="small">
                      <div className="conversation-avatar-wrap">
                        <Avatar
                          icon={isGroup ? <TeamOutlined /> : <UserOutlined />}
                          src={!isGroup ? conv.avatar : undefined}
                          style={isGroup ? { backgroundColor: '#1890ff' } : undefined}
                          size={40}
                        />
                        {!isGroup && conv.status && (
                          <div className={`conversation-status-dot ${conv.status === 'online' ? 'online' : 'offline'}`} />
                        )}
                      </div>
                    </Badge>
                    <div className="conversation-info">
                      <div className="conversation-name">{conv.name}</div>
                      {conv.lastMessage && (
                        <div className="conversation-preview">
                          {isGroup && conv.lastMessage.senderName
                            ? `${conv.lastMessage.senderName}: ${conv.lastMessage.content?.slice(0, 20)}`
                            : conv.lastMessage.content?.slice(0, 30)}
                        </div>
                      )}
                    </div>
                    {conv.lastMessage && (
                      <div className="conversation-time">
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

      {/* 折叠模式：显示紧凑会话列表 */}
      {collapsed && location.pathname === '/' && conversations.length > 0 && (
        <div className="conversation-list-compact">
          {conversations.map((conv) => {
            const isGroup = conv.type === 'group';
            return (
              <div
                key={conv.id}
                className={`conversation-item-compact ${conv.id === currentConversation ? 'active' : ''}`}
                onClick={() => handleConversationClick(conv.id)}
                title={conv.name}
              >
                <Badge count={conv.unreadCount} size="small" offset={[-6, 0]}>
                  <Avatar
                    icon={isGroup ? <TeamOutlined /> : <UserOutlined />}
                    src={!isGroup ? conv.avatar : undefined}
                    style={isGroup ? { backgroundColor: '#1890ff' } : undefined}
                    size={32}
                  />
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        className="sidebar-menu"
      />
    </Sider>
  );
}

export default Sidebar;
