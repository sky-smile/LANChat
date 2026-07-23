import { useEffect, useRef } from 'react';
import VoiceCall from './VoiceCall';
import NavRail from './NavRail';
import ConversationList from './ConversationList';
import Chat from './Chat';
import Contacts from './Contacts';
import Groups from './Groups';
import Settings from './Settings';
import Admin from './Admin';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWebRTC, WebRTCContext } from '@/hooks/useWebRTC';
import { useAuthStore } from '@/stores/auth';
import { useNavStore, type PanelType } from '@/stores/nav';
import './Layout.css';

/** 中间面板内容映射 */
const panelComponents: Record<PanelType, React.ComponentType> = {
  messages: ConversationList,
  contacts: Contacts,
  groups: Groups,
  settings: Settings,
  admin: Admin,
};

function Layout() {
  // 共享的 WebSocket ref，供 WebSocket 和 WebRTC 使用
  const wsRef = useRef<WebSocket | null>(null);

  // 页面加载时，如果已认证则立即标记在线（防止刷新后显示离线）
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const updateUserStatus = useAuthStore((state) => state.updateUserStatus);
  useEffect(() => {
    if (isAuthenticated) {
      updateUserStatus('online');
    }
  }, [isAuthenticated, updateUserStatus]);

  // 初始化 WebSocket 连接
  useWebSocket(wsRef);

  // 初始化 WebRTC（内部自动注册信令处理器到 callSignalingBus）
  const { capabilities, acceptCall, rejectCall, hangup, toggleMute } = useWebRTC(wsRef);

  // 获取当前激活的中间面板
  const activePanel = useNavStore((state) => state.activePanel);
  const MiddleContent = panelComponents[activePanel];

  // 设置和管理面板不需要显示聊天窗口
  const hideChatPanel = activePanel === 'settings' || activePanel === 'admin';

  return (
    <WebRTCContext.Provider value={capabilities}>
      <div className="app-layout-3col">
        {/* 左列：导航栏 */}
        <NavRail />

        {/* 中间列：列表面板 */}
        <div className={`middle-panel ${hideChatPanel ? 'middle-panel-expanded' : ''}`}>
          <MiddleContent />
        </div>

        {/* 右列：聊天窗口（设置和管理时隐藏） */}
        {!hideChatPanel && (
          <div className="right-panel">
            <Chat />
          </div>
        )}

        {/* 语音通话 UI 悬浮条 */}
        <VoiceCall
          onAccept={acceptCall}
          onReject={rejectCall}
          onHangup={hangup}
          onToggleMute={toggleMute}
          expanded={hideChatPanel}
        />
      </div>
    </WebRTCContext.Provider>
  );
}

export default Layout;
