import { useEffect, useState } from 'react';
import { Button, Avatar, Badge } from 'antd';
import {
  PhoneOutlined,
  CloseOutlined,
  AudioOutlined,
  AudioMutedOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useCallStore } from '@/stores/call';
import './VoiceCall.css';

interface VoiceCallProps {
  onAccept: () => void;
  onReject: () => void;
  onHangup: () => void;
  onToggleMute: () => void;
}

function VoiceCall({ onAccept, onReject, onHangup, onToggleMute }: VoiceCallProps) {
  const {
    callStatus, peerName, role, isMuted, connectedAt,
    callType, groupName, participants,
  } = useCallStore();
  const [duration, setDuration] = useState('00:00');

  // 组件挂载时重置残留的通话状态（如页面刷新后）
  useEffect(() => {
    const state = useCallStore.getState();
    if (state.callStatus !== 'idle') {
      // 直接重置到 idle，不经过 'ended' 状态（避免闪现遮罩层）
      useCallStore.setState({
        callStatus: 'idle',
        callId: null,
        callType: 'single',
        peerId: null,
        peerName: null,
        role: null,
        isMuted: false,
        connectedAt: null,
        groupId: null,
        groupName: null,
        participants: [],
      });
    }
  }, []);

  // 通话计时
  useEffect(() => {
    if (callStatus !== 'connected' || !connectedAt) return;

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - connectedAt) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      setDuration(`${mins}:${secs}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [callStatus, connectedAt]);

  // 不在通话中则不渲染
  if (callStatus === 'idle') return null;

  const isGroup = callType === 'group';
  const isRinging = callStatus === 'ringing' && role === 'callee';
  const isCalling = callStatus === 'calling';
  const isConnected = callStatus === 'connected';
  const isEnded = callStatus === 'ended';

  // 显示名称
  const displayName = isGroup ? (groupName || '群组通话') : (peerName || '未知用户');

  return (
    <div className="voice-call-overlay">
      <div className="voice-call-card">
        {/* 头像 */}
        <div className="voice-call-avatar">
          {isGroup ? (
            <Badge count={participants.length} offset={[-5, 65]}>
              <Avatar size={80} icon={<TeamOutlined />} style={{ backgroundColor: '#1890ff' }} />
            </Badge>
          ) : (
            <Avatar size={80} icon={<PhoneOutlined />} />
          )}
        </div>

        {/* 名称 */}
        <div className="voice-call-name">{displayName}</div>

        {/* 群组通话参与者列表 */}
        {isGroup && participants.length > 0 && (
          <div className="voice-call-participants">
            {participants.map((p) => (
              <Badge key={p.user_id} dot status={p.is_muted ? 'default' : 'success'} offset={[-2, 2]}>
                <Avatar size={32} style={{ backgroundColor: '#87d068', margin: '2px' }}>
                  {p.user_name?.[0] || '?'}
                </Avatar>
              </Badge>
            ))}
          </div>
        )}

        {/* 状态文字 */}
        <div className="voice-call-status">
          {isCalling && '正在呼叫...'}
          {isRinging && !isGroup && '来电中...'}
          {isRinging && isGroup && `${peerName || '好友'} 邀请你加入群组通话`}
          {callStatus === 'connecting' && '连接中...'}
          {isConnected && duration}
          {isEnded && '通话已结束'}
        </div>

        {/* 操作按钮 */}
        <div className="voice-call-actions">
          {/* 被叫方：来电时显示接听/拒接 */}
          {isRinging && (
            <>
              <Button
                type="primary"
                shape="circle"
                size="large"
                icon={<PhoneOutlined />}
                className="call-btn call-btn-accept"
                onClick={onAccept}
              />
              <Button
                danger
                shape="circle"
                size="large"
                icon={<CloseOutlined />}
                className="call-btn call-btn-reject"
                onClick={onReject}
              />
            </>
          )}

          {/* 通话中：显示静音/挂断 */}
          {isConnected && (
            <>
              <Button
                shape="circle"
                size="large"
                icon={isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
                className={`call-btn ${isMuted ? 'call-btn-muted' : 'call-btn-unmuted'}`}
                onClick={onToggleMute}
              />
              <Button
                danger
                shape="circle"
                size="large"
                icon={<CloseOutlined />}
                className="call-btn call-btn-hangup"
                onClick={onHangup}
              />
            </>
          )}

          {/* 呼叫中/连接中：只显示挂断 */}
          {(isCalling || callStatus === 'connecting') && (
            <Button
              danger
              shape="circle"
              size="large"
              icon={<CloseOutlined />}
              className="call-btn call-btn-hangup"
              onClick={onHangup}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default VoiceCall;
