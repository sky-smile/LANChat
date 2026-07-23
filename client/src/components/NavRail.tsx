import { Avatar, Dropdown, Badge } from 'antd';
import {
  MessageOutlined,
  ContactsOutlined,
  TeamOutlined,
  SettingOutlined,
  SafetyOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useNavStore, type PanelType } from '@/stores/nav';
import './NavRail.css';

function NavRail() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const activePanel = useNavStore((state) => state.activePanel);
  const setActivePanel = useNavStore((state) => state.setActivePanel);
  const conversations = useChatStore((state) => state.conversations);

  // 计算未读消息总数
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const navItems: { key: PanelType; icon: React.ReactNode; label: string; badge?: number }[] = [
    {
      key: 'messages',
      icon: <MessageOutlined />,
      label: '消息',
      badge: totalUnread > 0 ? totalUnread : undefined,
    },
    { key: 'contacts', icon: <ContactsOutlined />, label: '联系人' },
    { key: 'groups', icon: <TeamOutlined />, label: '群组' },
    ...(user?.role === 'admin'
      ? [{ key: 'admin' as PanelType, icon: <SafetyOutlined />, label: '管理' }]
      : []),
    { key: 'settings', icon: <SettingOutlined />, label: '设置' },
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
      onClick: () => setActivePanel('settings'),
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

  return (
    <div className="nav-rail">
      {/* 用户信息 */}
      <div className="nav-rail-user">
        <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
          <div className="nav-rail-user-info">
            <div className="nav-rail-avatar-wrap">
              <Avatar
                size={36}
                icon={<UserOutlined />}
                src={user?.avatarUrl}
                className="nav-rail-avatar"
              />
              <span className={`nav-rail-status-dot ${user?.status || 'offline'}`} />
            </div>
            <span className="nav-rail-username" title={user?.displayName || user?.username}>
              {user?.displayName || user?.username}
            </span>
          </div>
        </Dropdown>
      </div>

      {/* 导航按钮 */}
      <div className="nav-rail-items">
        {navItems.map((item) => (
          <div
            key={item.key}
            className={`nav-rail-item ${activePanel === item.key ? 'active' : ''}`}
            onClick={() => setActivePanel(item.key)}
            title={item.label}
          >
            <Badge count={item.badge} size="small" offset={[-4, 4]}>
              <span className="nav-rail-icon">{item.icon}</span>
            </Badge>
            <span className="nav-rail-label">{item.label}</span>
          </div>
        ))}
      </div>

      {/* 底部退出 */}
      <div className="nav-rail-footer">
        <div
          className="nav-rail-item"
          onClick={() => {
            logout();
            navigate('/login');
          }}
          title="退出登录"
        >
          <span className="nav-rail-icon"><LogoutOutlined /></span>
          <span className="nav-rail-label">退出</span>
        </div>
      </div>
    </div>
  );
}

export default NavRail;
