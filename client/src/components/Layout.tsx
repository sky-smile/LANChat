import { useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Layout as AntLayout } from 'antd';
import Sidebar from './Sidebar';
import VoiceCall from './VoiceCall';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWebRTC } from '@/hooks/useWebRTC';
import './Layout.css';

const { Content } = AntLayout;

function Layout() {
  // 共享的 WebSocket ref，供 WebSocket 和 WebRTC 使用
  const wsRef = useRef<WebSocket | null>(null);

  // 初始化 WebSocket 连接
  useWebSocket(wsRef);

  // 初始化 WebRTC（内部自动注册信令处理器到 callSignalingBus）
  const { acceptCall, rejectCall, hangup, toggleMute } = useWebRTC(wsRef);

  return (
    <AntLayout className="app-layout">
      <Sidebar />
      <Content className="app-content">
        <Outlet />
      </Content>
      {/* 语音通话 UI 覆盖层 */}
      <VoiceCall
        onAccept={acceptCall}
        onReject={rejectCall}
        onHangup={hangup}
        onToggleMute={toggleMute}
      />
    </AntLayout>
  );
}

export default Layout;
