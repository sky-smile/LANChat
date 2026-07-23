import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/services/api';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  department?: string;
  role: string;
  status: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  updateUserStatus: (status: string) => void;
}

interface LoginResponse {
  token: string;
  // 服务器返回 snake_case 字段
  user: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url?: string;
    department?: string;
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

      login: async (username: string, password: string) => {
        const response = await api.post<{ code: number; data: LoginResponse }>('/auth/login', {
          username,
          password,
        });

        const { token, user: raw } = response.data.data;
        // 服务器返回 snake_case，转换为 camelCase
        const user: User = {
          id: raw.id,
          username: raw.username,
          displayName: raw.display_name || '',
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
