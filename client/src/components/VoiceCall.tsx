import { useEffect, useRef, useState } from 'react';
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
  expanded?: boolean;
}

function VoiceCall({ onAccept, onReject, onHangup, onToggleMute, expanded }: VoiceCallProps) {
  const {
    callStatus, peerName, role, isMuted, connectedAt,
    callType, groupName,
  } = useCallStore();
  const [duration, setDuration] = useState('00:00');
  const isFirstMount = useRef(true);

  // 清理残留的通话状态（HMR 热更新后 store 状态会保留）
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const state = useCallStore.getState();
    if (state.callStatus === 'ended') {
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
  const isCalling = callStatus === 'calling' || (callStatus === 'ringing' && role === 'caller');
  const isConnecting = callStatus === 'connecting';
  const isConnected = callStatus === 'connected';
  const isEnded = callStatus === 'ended';

  // peerName 可能为空（老版本来电未传名称），兜底显示"来电"
  const displayName = isGroup ? (groupName || '群组通话') : (peerName || '来电');

  // 状态指示文本
  let statusText = '';
  if (isCalling) statusText = '正在呼叫...';
  else if (isRinging && !isGroup) statusText = '来电中...';
  else if (isRinging && isGroup) statusText = `${peerName || '好友'} 邀请你加入群组通话`;
  else if (isConnecting) statusText = '连接中...';
  else if (isConnected) statusText = duration;
  else if (isEnded) statusText = '通话已结束';

  // 呼叫/响铃/连接中 → 脉冲动画
  const isPulsing = isCalling || isRinging || isConnecting;

  return (
    <div className={`voice-call-bar-wrapper ${expanded ? 'voice-call-bar-wrapper-expanded' : ''}`}>
      <div className={`voice-call-bar ${isPulsing ? 'voice-call-bar-pulse' : ''} ${isEnded ? 'voice-call-bar-ended' : ''}`}>
      {/* 左侧：头像 + 信息 */}
      <div className="voice-call-bar-left">
        <Badge dot status={isConnected ? 'success' : isEnded ? 'default' : 'processing'} offset={[-2, 28]}>
          <Avatar
            size={36}
            icon={isGroup ? <TeamOutlined /> : <PhoneOutlined />}
            style={{ backgroundColor: isConnected ? '#52c41a' : '#1890ff', flexShrink: 0 }}
          />
        </Badge>
        <div className="voice-call-bar-info">
          <span className="voice-call-bar-name">{displayName}</span>
          <span className="voice-call-bar-status">{statusText}</span>
        </div>
      </div>

      {/* 右侧：操作按钮 */}
      <div className="voice-call-bar-actions">
        {/* 被叫方来电：接听/拒接 */}
        {isRinging && (
          <>
            <Button
              type="primary"
              shape="circle"
              size="small"
              icon={<PhoneOutlined />}
              className="call-bar-btn call-bar-btn-accept"
              onClick={onAccept}
            />
            <Button
              danger
              shape="circle"
              size="small"
              icon={<CloseOutlined />}
              className="call-bar-btn call-bar-btn-reject"
              onClick={onReject}
            />
          </>
        )}

        {/* 通话中：静音/挂断 */}
        {isConnected && (
          <>
            <Button
              shape="circle"
              size="small"
              icon={isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
              className={`call-bar-btn ${isMuted ? 'call-bar-btn-muted' : ''}`}
              onClick={onToggleMute}
            />
            <Button
              danger
              shape="circle"
              size="small"
              icon={<CloseOutlined />}
              className="call-bar-btn call-bar-btn-hangup"
              onClick={onHangup}
            />
          </>
        )}

        {/* 呼叫中/连接中：挂断 */}
        {(isCalling || isConnecting) && (
          <Button
            danger
            shape="circle"
            size="small"
            icon={<CloseOutlined />}
            className="call-bar-btn call-bar-btn-hangup"
            onClick={onHangup}
          />
        )}

        {/* 通话已结束：关闭 */}
        {isEnded && (
          <Button
            shape="circle"
            size="small"
            icon={<CloseOutlined />}
            className="call-bar-btn"
            onClick={() => useCallStore.setState({
              callStatus: 'idle', callId: null, callType: 'single',
              peerId: null, peerName: null, role: null, isMuted: false,
              connectedAt: null, groupId: null, groupName: null, participants: [],
            })}
          />
        )}
      </div>
      </div>
    </div>
  );
}

export default VoiceCall;
