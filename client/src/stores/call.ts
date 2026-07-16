import { create } from 'zustand';

/** 通话状态 */
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

/** 通话角色 */
export type CallRole = 'caller' | 'callee';

interface CallState {
  /** 当前通话状态 */
  callStatus: CallStatus;
  /** 通话 ID */
  callId: string | null;
  /** 对方用户 ID */
  peerId: string | null;
  /** 对方用户名 */
  peerName: string | null;
  /** 通话角色 */
  role: CallRole | null;
  /** 是否静音 */
  isMuted: boolean;
  /** 通话开始时间（用于计时） */
  connectedAt: number | null;

  // ---- Actions ----
  /** 发起通话（呼叫方） */
  startCall: (callId: string, peerId: string, peerName: string) => void;
  /** 收到来电（被叫方） */
  receiveCall: (callId: string, callerId: string, callerName: string) => void;
  /** 对方已接听 */
  setConnected: () => void;
  /** 通话结束 */
  endCall: () => void;
  /** 切换静音 */
  toggleMute: () => void;
  /** 设置通话状态 */
  setStatus: (status: CallStatus) => void;
}

export const useCallStore = create<CallState>((set) => ({
  callStatus: 'idle',
  callId: null,
  peerId: null,
  peerName: null,
  role: null,
  isMuted: false,
  connectedAt: null,

  startCall: (callId, peerId, peerName) => {
    set({
      callStatus: 'calling',
      callId,
      peerId,
      peerName,
      role: 'caller',
      isMuted: false,
      connectedAt: null,
    });
  },

  receiveCall: (callId, callerId, callerName) => {
    set({
      callStatus: 'ringing',
      callId,
      peerId: callerId,
      peerName: callerName,
      role: 'callee',
      isMuted: false,
      connectedAt: null,
    });
  },

  setConnected: () => {
    set({
      callStatus: 'connected',
      connectedAt: Date.now(),
    });
  },

  endCall: () => {
    set({
      callStatus: 'ended',
    });
    // 短暂显示 "已结束" 后重置
    setTimeout(() => {
      set({
        callStatus: 'idle',
        callId: null,
        peerId: null,
        peerName: null,
        role: null,
        isMuted: false,
        connectedAt: null,
      });
    }, 1500);
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  },

  setStatus: (status) => {
    set({ callStatus: status });
  },
}));
