import { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown } from 'antd';
import {
  MessageOutlined,
  ContactsOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import './Sidebar.css';

const { Sider } = AntLayout;

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

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

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      className="app-sidebar"
      width={200}
    >
      <div className="sidebar-header">
        <Avatar size={collapsed ? 32 : 48} icon={<UserOutlined />} />
        {!collapsed && user && (
          <div className="user-info">
            <div className="username">{user.displayName || user.username}</div>
            <div className="status">{user.status}</div>
          </div>
        )}
      </div>

      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        className="sidebar-menu"
      />

      <div className="sidebar-footer">
        <Dropdown menu={{ items: userMenuItems }} placement="topRight">
          <div className="user-trigger">
            <Avatar size={24} icon={<UserOutlined />} />
            {!collapsed && <span className="username">{user?.username}</span>}
          </div>
        </Dropdown>
      </div>
    </Sider>
  );
}

export default Sidebar;
