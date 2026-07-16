import { Outlet } from 'react-router-dom';
import { Layout as AntLayout } from 'antd';
import Sidebar from './Sidebar';
import { useWebSocket } from '@/hooks/useWebSocket';
import './Layout.css';

const { Content } = AntLayout;

function Layout() {
  // 在 Layout 中初始化 WebSocket 连接
  useWebSocket();

  return (
    <AntLayout className="app-layout">
      <Sidebar />
      <Content className="app-content">
        <Outlet />
      </Content>
    </AntLayout>
  );
}

export default Layout;
