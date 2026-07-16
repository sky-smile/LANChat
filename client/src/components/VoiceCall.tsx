import { useEffect, useState } from 'react';
import { Button, Avatar } from 'antd';
import {
  PhoneOutlined,
  CloseOutlined,
  AudioOutlined,
  AudioMutedOutlined,
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
  const { callStatus, peerName, role, isMuted, connectedAt } = useCallStore();
  const [duration, setDuration] = useState('00:00');

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

  const isRinging = callStatus === 'ringing' && role === 'callee';
  const isCalling = callStatus === 'calling';
  const isConnected = callStatus === 'connected';
  const isEnded = callStatus === 'ended';

  return (
    <div className="voice-call-overlay">
      <div className="voice-call-card">
        {/* 头像 */}
        <div className="voice-call-avatar">
          <Avatar size={80} icon={<PhoneOutlined />} />
        </div>

        {/* 对方名称 */}
        <div className="voice-call-name">{peerName || '未知用户'}</div>

        {/* 状态文字 */}
        <div className="voice-call-status">
          {isCalling && '正在呼叫...'}
          {isRinging && '来电中...'}
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
