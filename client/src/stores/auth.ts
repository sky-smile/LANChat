import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';
import { useChatStore } from './chat';

export interface User {
  id: string;
  /** 账户/手机号（对应原 username） */
  account: string;
  /** 姓名（对应原 displayName） */
  name: string;
  avatarUrl?: string;
  department: string;
  role: string;
  status: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (account: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  updateUserStatus: (status: string) => void;
}

interface LoginResponse {
  token: string;
  // 服务器返回 snake_case 字段；account/name 对应原 username/display_name
  user: {
    id: string;
    account: string;
    name: string;
    avatar_url?: string;
    department: string;
    role: string;
    status: string;
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: async (account: string, password: string) => {
        const response = await api.post<{ code: number; data: LoginResponse }>('/auth/login', {
          account,
          password,
        });

        const { token, user: raw } = response.data.data;
        // 服务器返回 snake_case，转换为 camelCase
        const user: User = {
          id: raw.id,
          account: raw.account,
          name: raw.name,
          avatarUrl: raw.avatar_url,
          department: raw.department,
          role: raw.role,
          status: 'online',
        };
        set({
          token,
          user,
          isAuthenticated: true,
        });
      },

      logout: () => {
        // 通知服务器设置离线状态
        api.post('/auth/logout').catch(() => {});
        // 清理聊天状态
        useChatStore.getState().reset();
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        });
      },

      setUser: (user: User) => {
        set({ user });
      },

      updateUserStatus: (status: string) => {
        set((state) => ({
          user: state.user ? { ...state.user, status } : null,
        }));
      },
    }),
    {
      name: 'auth-storage',
    },
  ),
);
