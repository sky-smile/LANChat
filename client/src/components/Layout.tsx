import { Outlet } from 'react-router-dom';
import { Layout as AntLayout } from 'antd';
import Sidebar from './Sidebar';
import './Layout.css';

const { Content } = AntLayout;

function Layout() {
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
