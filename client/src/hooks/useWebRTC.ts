import { useRef, useCallback, useEffect, createContext, useContext } from 'react';
import { useCallStore, type GroupCallParticipant } from '@/stores/call';
import { useAuthStore } from '@/stores/auth';
import { setCallSignalingHandler } from './callSignalingBus';
import { playRingSound, stopRingSound } from '@/utils/notification';

/** WebRTC 通话能力接口 */
export interface WebRTCCapabilities {
  initiateCall: (peerId: string, peerName: string) => Promise<void>;
  createGroupCall: (groupId: string, groupName: string) => Promise<void>;
  joinGroupCall: (callId: string, groupId: string, groupName: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  hangup: () => void;
  toggleMute: () => void;
}

const WebRTCContext = createContext<WebRTCCapabilities | null>(null);

/** 获取 WebRTC 通话能力（需在 WebRTCProvider 内使用） */
export function useWebRTCCapabilities(): WebRTCCapabilities | null {
  return useContext(WebRTCContext);
}

export { WebRTCContext };

/** WebRTC 配置 */
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    // 公共 STUN 服务器（局域网内主要用 STUN）
    { urls: 'stun:stun.l.google.com:19302' },
    // 私有 TURN 服务器（通过环境变量配置，用于跨 NAT 场景）
    ...(import.meta.env.VITE_TURN_URL ? [{
      urls: import.meta.env.VITE_TURN_URL as string,
      username: import.meta.env.VITE_TURN_USERNAME as string || 'lanchat',
      credential: import.meta.env.VITE_TURN_CREDENTIAL as string || '',
    }] : []),
  ],
};

/**
 * WebRTC 语音通话 Hook
 *
 * 支持单人通话和多人通话（Mesh 架构）
 * 通过现有 WebSocket 通道交换信令（Offer/Answer/ICE）
 */
export function useWebRTC(wsRef: React.MutableRefObject<WebSocket | null>) {
  // 单人通话 PeerConnection
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // 多人通话 PeerConnection 映射：user_id -> RTCPeerConnection
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  // 远端音频容器（由 React 渲染管理，音频元素挂载于此）
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  // 远端音频元素映射：user_id -> HTMLAudioElement
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const {
    setConnected,
    endCall,
    setStatus,
    updateParticipants,
    leaveGroupCall,
  } = useCallStore();

  /** 向 WebSocket 发送消息 */
  const wsSend = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, [wsRef]);

  /** 获取本地音频流 */
  const startLocalAudio = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error('[WebRTC] 获取麦克风失败:', err);
      throw err;
    }
  }, []);

  /** 播放远端音频 */
  const playRemoteAudio = useCallback((peerId: string, stream: MediaStream) => {
    let audio = remoteAudiosRef.current.get(peerId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      // 挂载到 React 管理的容器中，而非直接操作 document.body
      const container = audioContainerRef.current || document.body;
      container.appendChild(audio);
      remoteAudiosRef.current.set(peerId, audio);
    }
    audio.srcObject = stream;
  }, []);

  /** 清理单个远端音频元素 */
  const cleanupPeerAudio = useCallback((peerId: string) => {
    const audio = remoteAudiosRef.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      remoteAudiosRef.current.delete(peerId);
    }
  }, []);

  /** 清理所有远端音频元素 */
  const cleanupAllRemoteAudio = useCallback(() => {
    remoteAudiosRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
    remoteAudiosRef.current.clear();
  }, []);

  /** 清理单人通话资源 */
  const cleanupAndEnd = useCallback(() => {
    stopRingSound();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    cleanupAllRemoteAudio();
    endCall();
  }, [endCall, cleanupAllRemoteAudio]);

  /** 清理群组通话资源 */
  const cleanupGroupCall = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    cleanupAllRemoteAudio();
    leaveGroupCall();
  }, [leaveGroupCall, cleanupAllRemoteAudio]);

  /** 创建单人通话 PeerConnection */
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
      playRemoteAudio(targetPeerId, event.streams[0]);
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
  }, [wsSend, setConnected, playRemoteAudio, cleanupAndEnd]);

  /** 创建多人通话 PeerConnection（与特定参与者） */
  const createGroupPeerConnection = useCallback((callId: string, peerId: string) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsSend({
          type: 'call_ice',
          payload: {
            call_id: callId,
            sender_id: useAuthStore.getState().user?.id,
            receiver_id: peerId,
            candidate: event.candidate.candidate,
            sdp_mid: event.candidate.sdpMid,
            sdp_m_line_index: event.candidate.sdpMLineIndex,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] 收到群组远端音频轨道:', peerId);
      playRemoteAudio(peerId, event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] 群组连接状态 (${peerId}):`, pc.connectionState);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // 清理该 peer 的音频元素和 PeerConnection
        cleanupPeerAudio(peerId);
        pcsRef.current.delete(peerId);
      }
    };

    // 添加本地音频轨道
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pcsRef.current.set(peerId, pc);
    return pc;
  }, [wsSend, playRemoteAudio, cleanupPeerAudio]);

  /** 发起单人通话 */
  const initiateCall = useCallback(async (targetPeerId: string, targetPeerName: string) => {
    const cid = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = useAuthStore.getState().user?.id || '';
    const currentUser = useAuthStore.getState().user;
    const userName = currentUser?.displayName || currentUser?.username || '';

    console.log('[WebRTC] 发起通话:', cid, '目标:', targetPeerId);
    useCallStore.getState().startCall(cid, targetPeerId, targetPeerName);

    const pc = createPeerConnection(cid, targetPeerId);

    try {
      const stream = await startLocalAudio();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    } catch (err) {
      console.error('[WebRTC] 获取麦克风失败，取消通话');
      useCallStore.getState().endCall();
      return;
    }

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

  /** 创建群组通话 */
  const createGroupCall = useCallback(async (groupId: string, groupName: string) => {
    const cid = `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = useAuthStore.getState().user?.id || '';
    const userName = useAuthStore.getState().user?.displayName || '';

    console.log('[WebRTC] 创建群组通话:', cid, '群组:', groupId);

    try {
      await startLocalAudio();
    } catch (err) {
      console.error('[WebRTC] 获取麦克风失败，无法创建群组通话');
      return;
    }

    useCallStore.getState().createGroupCall(cid, groupId, groupName);

    wsSend({
      type: 'group_call_create',
      payload: {
        call_id: cid,
        group_id: groupId,
        creator_id: userId,
        creator_name: userName,
      },
    });
  }, [wsSend, startLocalAudio]);

  /** 加入群组通话 */
  const joinGroupCall = useCallback(async (callId: string, groupId: string, groupName: string) => {
    const userName = useAuthStore.getState().user?.displayName || '';

    console.log('[WebRTC] 加入群组通话:', callId);

    try {
      await startLocalAudio();
    } catch (err) {
      console.error('[WebRTC] 获取麦克风失败，无法加入群组通话');
      return;
    }

    useCallStore.getState().joinGroupCall(callId, groupId, groupName);

    wsSend({
      type: 'group_call_join',
      payload: {
        call_id: callId,
        user_id: useAuthStore.getState().user?.id,
        user_name: userName,
      },
    });
  }, [wsSend, startLocalAudio]);

  /** 拒接来电 / 忽略群组通话邀请 */
  const rejectCall = useCallback(() => {
    const state = useCallStore.getState();
    if (state.callId) {
      // 群组通话邀请 → 直接忽略，不发送消息
      if (state.callType !== 'group' || state.callStatus !== 'ringing') {
        wsSend({
          type: 'call_reject',
          payload: {
            call_id: state.callId,
            user_id: useAuthStore.getState().user?.id,
          },
        });
      }
    }
    cleanupAndEnd();
  }, [wsSend, cleanupAndEnd]);

  /** 接听来电（支持单人和群组通话邀请） */
  const acceptCall = useCallback(async () => {
    stopRingSound();
    const state = useCallStore.getState();
    if (!state.callId || !state.peerId) return;

    // 群组通话邀请 → 加入群组通话
    if (state.callType === 'group' && state.groupId) {
      await joinGroupCall(state.callId, state.groupId, state.groupName || '群组通话');
      return;
    }

    // 单人通话接听
    console.log('[WebRTC] 接听通话:', state.callId);

    const pc = createPeerConnection(state.callId, state.peerId);

    try {
      const stream = await startLocalAudio();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    } catch (err) {
      console.error('[WebRTC] 获取麦克风失败，拒接通话');
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

    wsSend({
      type: 'call_accept',
      payload: {
        call_id: state.callId,
        user_id: useAuthStore.getState().user?.id,
      },
    });

    setStatus('connecting');
  }, [wsSend, createPeerConnection, startLocalAudio, setStatus, cleanupAndEnd, joinGroupCall]);

  /** 挂断通话 */
  const hangup = useCallback(() => {
    const state = useCallStore.getState();
    if (state.callId) {
      if (state.callType === 'group') {
        wsSend({
          type: 'group_call_leave',
          payload: {
            call_id: state.callId,
            user_id: useAuthStore.getState().user?.id,
          },
        });
        cleanupGroupCall();
      } else {
        wsSend({
          type: 'call_hangup',
          payload: {
            call_id: state.callId,
            user_id: useAuthStore.getState().user?.id,
          },
        });
        cleanupAndEnd();
      }
    }
  }, [wsSend, cleanupAndEnd, cleanupGroupCall]);

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

  /** 为新参与者建立 P2P 连接 */
  const connectToNewParticipant = useCallback(async (callId: string, peerId: string) => {
    const pc = createGroupPeerConnection(callId, peerId);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsSend({
        type: 'call_offer',
        payload: {
          call_id: callId,
          sender_id: useAuthStore.getState().user?.id,
          receiver_id: peerId,
          sdp_type: 'offer',
          sdp: offer.sdp,
        },
      });
    } catch (err) {
      console.error('[WebRTC] 为新参与者创建 Offer 失败:', err);
    }
  }, [wsSend, createGroupPeerConnection]);

  /**
   * 处理收到的信令消息（由 useWebSocket 通过 callSignalingBus 调用）
   */
  const handleSignaling = useCallback(async (msg: { type: string; payload?: unknown }) => {
    const payload = msg.payload as Record<string, unknown> | undefined;
    console.log('[WebRTC] 收到信令:', msg.type, payload);
    if (!payload) return;

    switch (msg.type) {
      case 'call_invite': {
        const p = payload as { call_id: string; caller_id: string; caller_name: string };
        useCallStore.getState().receiveCall(p.call_id, p.caller_id, p.caller_name);
        playRingSound();
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

      // ---- 群组通话信令 ----
      case 'group_call_participants': {
        const p = payload as { call_id: string; participants: GroupCallParticipant[] };
        const callStore = useCallStore.getState();

        if (p.call_id !== callStore.callId) break;

        const currentUserId = useAuthStore.getState().user?.id;
        const newParticipantIds = p.participants
          .filter((pp) => pp.user_id !== currentUserId)
          .map((pp) => pp.user_id);

        updateParticipants(p.participants);

        // 为新参与者建立连接（仅 user_id 较小的一方创建 Offer，避免 Offer/Offer 冲突）
        for (const peerId of newParticipantIds) {
          if (!pcsRef.current.has(peerId) && currentUserId && currentUserId < peerId) {
            await connectToNewParticipant(p.call_id, peerId);
          }
        }

        if (callStore.callStatus !== 'connected') {
          setStatus('connected');
        }
        break;
      }

      case 'group_call_invite': {
        const invite = payload as {
          call_id: string;
          group_id: string;
          group_name: string;
          caller_id: string;
          caller_name: string;
        };
        console.log('[WebRTC] 收到群组通话邀请:', invite);
        // 存储邀请信息，UI 层可监听此状态变化显示加入提示
        useCallStore.getState().receiveCall(
          invite.call_id,
          invite.caller_id,
          invite.caller_name,
        );
        // 标记为群组通话类型
        useCallStore.setState({ callType: 'group', groupId: invite.group_id, groupName: invite.group_name });
        break;
      }

      case 'group_call_ended': {
        cleanupGroupCall();
        break;
      }

      case 'call_offer': {
        const p = payload as { call_id: string; sender_id: string; sdp: string };
        const callStore = useCallStore.getState();

        let pc: RTCPeerConnection | null = null;

        if (callStore.callType === 'group') {
          let groupPc = pcsRef.current.get(p.sender_id);
          if (!groupPc) {
            groupPc = createGroupPeerConnection(p.call_id, p.sender_id);
          }
          pc = groupPc;
        } else {
          pc = pcRef.current;
        }

        if (!pc) {
          console.warn('[WebRTC] 收到 Offer 但 PeerConnection 未就绪');
          break;
        }

        try {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp: p.sdp }),
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
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
          if (callStore.callType !== 'group') {
            cleanupAndEnd();
          }
        }
        break;
      }

      case 'call_answer': {
        const p = payload as { call_id: string; sender_id: string; sdp: string };
        const callStore = useCallStore.getState();

        let pc: RTCPeerConnection | null = null;

        if (callStore.callType === 'group') {
          pc = pcsRef.current.get(p.sender_id) || null;
        } else {
          pc = pcRef.current;
        }

        if (!pc) break;

        try {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp: p.sdp }),
          );
        } catch (err) {
          console.error('[WebRTC] 处理 Answer 失败:', err);
          if (callStore.callType !== 'group') {
            cleanupAndEnd();
          }
        }
        break;
      }

      case 'call_ice': {
        const p = payload as {
          call_id: string;
          sender_id: string;
          candidate: string;
          sdp_mid: string;
          sdp_m_line_index: number;
        };
        const callStore = useCallStore.getState();

        let pc: RTCPeerConnection | null = null;

        if (callStore.callType === 'group') {
          pc = pcsRef.current.get(p.sender_id) || null;
        } else {
          pc = pcRef.current;
        }

        if (!pc) break;

        try {
          await pc.addIceCandidate(
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
  }, [wsSend, cleanupAndEnd, cleanupGroupCall, updateParticipants, connectToNewParticipant, createGroupPeerConnection, setStatus]);

  // 注册 handleSignaling 到信令总线
  useEffect(() => {
    setCallSignalingHandler(handleSignaling);
    return () => {
      setCallSignalingHandler(null);
    };
  }, [handleSignaling]);

  // 初始化远端音频容器
  useEffect(() => {
    const container = document.createElement('div');
    container.style.display = 'none';
    container.setAttribute('data-lanchat-audio-container', '');
    document.body.appendChild(container);
    audioContainerRef.current = container;
    return () => {
      // 清理所有音频后移除容器
      cleanupAllRemoteAudio();
      container.remove();
      audioContainerRef.current = null;
    };
  }, [cleanupAllRemoteAudio]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanupAndEnd();
    };
  }, [cleanupAndEnd]);

  const capabilities: WebRTCCapabilities = {
    initiateCall,
    createGroupCall,
    joinGroupCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
  };

  return {
    capabilities,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
  };
}
