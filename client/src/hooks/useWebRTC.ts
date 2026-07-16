import { useRef, useCallback, useEffect } from 'react';
import { useCallStore } from '@/stores/call';
import { useAuthStore } from '@/stores/auth';
import { setCallSignalingHandler } from './callSignalingBus';

/** WebRTC 配置 */
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

/** 模块级引用：供外部组件调用发起通话 */
let _initiateCallRef: ((peerId: string, peerName: string) => Promise<void>) | null = null;

/** 获取发起通话函数（供 Chat 等组件调用） */
export function getInitiateCall() {
  return _initiateCallRef;
}

/**
 * WebRTC 语音通话 Hook
 *
 * 通过现有 WebSocket 通道交换信令（Offer/Answer/ICE），
 * 建立点对点音频连接。
 */
export function useWebRTC(wsRef: React.MutableRefObject<WebSocket | null>) {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const {
    setConnected,
    endCall,
    setStatus,
  } = useCallStore();

  /** 向 WebSocket 发送消息 */
  const wsSend = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, [wsRef]);

  /** 创建 RTCPeerConnection 并绑定事件 */
  const createPeerConnection = useCallback((targetCallId: string, targetPeerId: string) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsSend({
          type: 'call_ice',
          payload: {
            call_id: targetCallId,
            sender_id: useAuthStore.getState().user?.id,
            receiver_id: targetPeerId,
            candidate: event.candidate.candidate,
            sdp_mid: event.candidate.sdpMid,
            sdp_m_line_index: event.candidate.sdpMLineIndex,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] 收到远端音频轨道');
      // 播放远端音频
      if (!remoteAudioRef.current) {
        const audio = new Audio();
        audio.autoplay = true;
        document.body.appendChild(audio);
        remoteAudioRef.current = audio;
      }
      remoteAudioRef.current.srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] 连接状态:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          setConnected();
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          cleanupAndEnd();
          break;
      }
    };

    pcRef.current = pc;
    return pc;
  }, [wsSend, setConnected]);

  /** 获取本地音频流并添加到连接 */
  const startLocalAudio = useCallback(async (pc: RTCPeerConnection) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      return stream;
    } catch (err) {
      console.error('[WebRTC] 获取麦克风失败:', err);
      throw err;
    }
  }, []);

  /** 清理资源 */
  const cleanupAndEnd = useCallback(() => {
    // 停止本地音频
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    // 关闭 PeerConnection
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    // 移除远端音频元素
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
    endCall();
  }, [endCall]);

  /**
   * 发起通话（呼叫方）
   * 1. 发送 call_invite
   * 2. 等待 call_status(ringing)
   * 3. 收到 call_status(connected) 后创建 Offer
   */
  const initiateCall = useCallback(async (targetPeerId: string, targetPeerName: string) => {
    const cid = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = useAuthStore.getState().user?.id || '';
    const userName = useAuthStore.getState().user?.displayName || '';

    console.log('[WebRTC] 发起通话:', cid, '目标:', targetPeerId);

    // 初始化通话状态
    useCallStore.getState().startCall(cid, targetPeerId, targetPeerName);

    // 创建 PeerConnection
    const pc = createPeerConnection(cid, targetPeerId);

    // 获取麦克风（失败则取消通话）
    try {
      await startLocalAudio(pc);
    } catch (err) {
      console.error('[WebRTC] 获取麦克风失败，取消通话');
      useCallStore.getState().endCall();
      return;
    }

    // 发送通话邀请
    wsSend({
      type: 'call_invite',
      payload: {
        call_id: cid,
        caller_id: userId,
        caller_name: userName,
        callee_id: targetPeerId,
      },
    });

    console.log('[WebRTC] 通话邀请已发送');
  }, [wsSend, createPeerConnection, startLocalAudio]);

  /** 拒接来电 */
  const rejectCall = useCallback(() => {
    const state = useCallStore.getState();
    if (state.callId) {
      wsSend({
        type: 'call_reject',
        payload: {
          call_id: state.callId,
          user_id: useAuthStore.getState().user?.id,
        },
      });
    }
    cleanupAndEnd();
  }, [wsSend, cleanupAndEnd]);

  /**
   * 接听来电（被叫方）
   * 1. 获取本地音频
   * 2. 创建 PeerConnection
   * 3. 发送 call_accept
   */
  const acceptCall = useCallback(async () => {
    const state = useCallStore.getState();
    if (!state.callId || !state.peerId) return;

    console.log('[WebRTC] 接听通话:', state.callId);

    const pc = createPeerConnection(state.callId, state.peerId);

    // 获取麦克风（失败则拒接）
    try {
      await startLocalAudio(pc);
    } catch (err) {
      console.error('[WebRTC] 获取麦克风失败，拒接通话');
      // 发送拒接消息并清理（不引用 rejectCall 避免循环依赖）
      wsSend({
        type: 'call_reject',
        payload: {
          call_id: state.callId,
          user_id: useAuthStore.getState().user?.id,
        },
      });
      cleanupAndEnd();
      return;
    }

    // 发送接听消息
    wsSend({
      type: 'call_accept',
      payload: {
        call_id: state.callId,
        user_id: useAuthStore.getState().user?.id,
      },
    });

    setStatus('connecting');
  }, [wsSend, createPeerConnection, startLocalAudio, setStatus, cleanupAndEnd]);

  /** 挂断通话 */
  const hangup = useCallback(() => {
    const state = useCallStore.getState();
    if (state.callId) {
      wsSend({
        type: 'call_hangup',
        payload: {
          call_id: state.callId,
          user_id: useAuthStore.getState().user?.id,
        },
      });
    }
    cleanupAndEnd();
  }, [wsSend, cleanupAndEnd]);

  /** 切换静音 */
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        useCallStore.getState().toggleMute();
      }
    }
  }, []);

  /**
   * 处理收到的信令消息（由 useWebSocket 调用）
   */
  const handleSignaling = useCallback(async (msg: { type: string; payload?: unknown }) => {
    const payload = msg.payload as Record<string, unknown> | undefined;
    console.log('[WebRTC] 收到信令:', msg.type, payload);
    if (!payload) return;

    switch (msg.type) {
      case 'call_invite': {
        // 被叫方收到来电
        const p = payload as { call_id: string; caller_id: string; caller_name: string };
        useCallStore.getState().receiveCall(p.call_id, p.caller_id, p.caller_name);
        break;
      }

      case 'call_status': {
        const p = payload as { call_id: string; status: string; message?: string };
        const callStore = useCallStore.getState();

        if (p.call_id !== callStore.callId) break;

        switch (p.status) {
          case 'ringing':
            callStore.setStatus('ringing');
            break;
          case 'connected':
            // 呼叫方在 connected 后创建 Offer
            if (callStore.role === 'caller' && pcRef.current) {
              try {
                const offer = await pcRef.current.createOffer();
                await pcRef.current.setLocalDescription(offer);
                wsSend({
                  type: 'call_offer',
                  payload: {
                    call_id: p.call_id,
                    sender_id: useAuthStore.getState().user?.id,
                    receiver_id: callStore.peerId,
                    sdp_type: 'offer',
                    sdp: offer.sdp,
                  },
                });
              } catch (err) {
                console.error('[WebRTC] 创建 Offer 失败:', err);
                cleanupAndEnd();
              }
            }
            break;
          case 'rejected':
            cleanupAndEnd();
            break;
          case 'ended':
            cleanupAndEnd();
            break;
        }
        break;
      }

      case 'call_offer': {
        // 被叫方收到 Offer → 创建 Answer
        const p = payload as { call_id: string; sender_id: string; sdp: string };

        if (!pcRef.current) {
          console.warn('[WebRTC] 收到 Offer 但 PeerConnection 未就绪');
          break;
        }

        try {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: p.sdp }),
          );
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          wsSend({
            type: 'call_answer',
            payload: {
              call_id: p.call_id,
              sender_id: useAuthStore.getState().user?.id,
              receiver_id: p.sender_id,
              sdp_type: 'answer',
              sdp: answer.sdp,
            },
          });
        } catch (err) {
          console.error('[WebRTC] 处理 Offer 失败:', err);
          cleanupAndEnd();
        }
        break;
      }

      case 'call_answer': {
        // 呼叫方收到 Answer → 设置远端描述
        const p = payload as { call_id: string; sdp: string };
        if (!pcRef.current) break;

        try {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: p.sdp }),
          );
        } catch (err) {
          console.error('[WebRTC] 处理 Answer 失败:', err);
          cleanupAndEnd();
        }
        break;
      }

      case 'call_ice': {
        // 收到 ICE candidate
        const p = payload as { call_id: string; candidate: string; sdp_mid: string; sdp_m_line_index: number };
        if (!pcRef.current) break;

        try {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate({
              candidate: p.candidate,
              sdpMid: p.sdp_mid,
              sdpMLineIndex: p.sdp_m_line_index,
            }),
          );
        } catch (err) {
          console.error('[WebRTC] 添加 ICE candidate 失败:', err);
        }
        break;
      }
    }
  }, [wsSend, cleanupAndEnd]);

  // 注册 initiateCall 到模块级引用，供其他组件调用
  useEffect(() => {
    _initiateCallRef = initiateCall;
    return () => {
      _initiateCallRef = null;
    };
  }, [initiateCall]);

  // 注册 handleSignaling 到信令总线，供 useWebSocket 调用
  useEffect(() => {
    setCallSignalingHandler(handleSignaling);
    return () => {
      setCallSignalingHandler(null);
    };
  }, [handleSignaling]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanupAndEnd();
    };
  }, [cleanupAndEnd]);

  return {
    initiateCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
  };
}
