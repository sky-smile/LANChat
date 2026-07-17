import { create } from 'zustand';

/** 通话状态 */
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

/** 通话角色 */
export type CallRole = 'caller' | 'callee';

/** 通话类型 */
export type CallType = 'single' | 'group';

/** 群组通话参与者 */
export interface GroupCallParticipant {
  user_id: string;
  user_name: string;
  is_muted: boolean;
}

interface CallState {
  /** 当前通话状态 */
  callStatus: CallStatus;
  /** 通话 ID */
  callId: string | null;
  /** 通话类型 */
  callType: CallType;
  /** 对方用户 ID（单人通话） */
  peerId: string | null;
  /** 对方用户名（单人通话） */
  peerName: string | null;
  /** 通话角色 */
  role: CallRole | null;
  /** 是否静音 */
  isMuted: boolean;
  /** 通话开始时间（用于计时） */
  connectedAt: number | null;

  // ---- 群组通话 ----
  /** 群组 ID */
  groupId: string | null;
  /** 群组名称 */
  groupName: string | null;
  /** 参与者列表 */
  participants: GroupCallParticipant[];

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

  // ---- 群组通话 Actions ----
  /** 创建群组通话 */
  createGroupCall: (callId: string, groupId: string, groupName: string) => void;
  /** 加入群组通话 */
  joinGroupCall: (callId: string, groupId: string, groupName: string) => void;
  /** 更新参与者列表 */
  updateParticipants: (participants: GroupCallParticipant[]) => void;
  /** 离开群组通话 */
  leaveGroupCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  callStatus: 'idle',
  callId: null,
  callType: 'single',
  peerId: null,
  peerName: null,
  role: null,
  isMuted: false,
  connectedAt: null,

  // 群组通话
  groupId: null,
  groupName: null,
  participants: [],

  startCall: (callId, peerId, peerName) => {
    set({
      callStatus: 'calling',
      callId,
      callType: 'single',
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
      callType: 'single',
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
    }, 1500);
  },

  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  },

  setStatus: (status) => {
    set({ callStatus: status });
  },

  // 群组通话
  createGroupCall: (callId, groupId, groupName) => {
    set({
      callStatus: 'connected',
      callId,
      callType: 'group',
      groupId,
      groupName,
      role: 'caller',
      isMuted: false,
      connectedAt: Date.now(),
      participants: [],
    });
  },

  joinGroupCall: (callId, groupId, groupName) => {
    set({
      callStatus: 'connecting',
      callId,
      callType: 'group',
      groupId,
      groupName,
      role: 'callee',
      isMuted: false,
      connectedAt: null,
      participants: [],
    });
  },

  updateParticipants: (participants) => {
    set({ participants });
  },

  leaveGroupCall: () => {
    set({
      callStatus: 'ended',
    });
    setTimeout(() => {
      set({
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
    }, 1500);
  },
}));
