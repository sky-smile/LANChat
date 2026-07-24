import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@/stores/auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    // 重置 store 状态
    useAuthStore.setState({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  });

  it('初始状态应为未认证', () => {
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('setUser 应更新用户信息', () => {
    const user = {
      id: 'u1',
      username: 'testuser',
      displayName: '测试用户',
      role: 'user',
      status: 'online',
    };
    useAuthStore.getState().setUser(user);
    const state = useAuthStore.getState();
    expect(state.user?.username).toBe('testuser');
    expect(state.user?.displayName).toBe('测试用户');
  });

  it('updateUserStatus 应更新状态', () => {
    useAuthStore.setState({
      user: {
        id: 'u1',
        username: 'testuser',
        displayName: 'Test',
        role: 'user',
        status: 'online',
      },
    });
    useAuthStore.getState().updateUserStatus('away');
    expect(useAuthStore.getState().user?.status).toBe('away');
  });

  it('logout 应清空认证状态', () => {
    useAuthStore.setState({
      token: 'some-token',
      user: {
        id: 'u1',
        username: 'testuser',
        displayName: 'Test',
        role: 'user',
        status: 'online',
      },
      isAuthenticated: true,
    });
    useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it('updateUserStatus 在无用户时不应报错', () => {
    useAuthStore.setState({ user: null });
    useAuthStore.getState().updateUserStatus('busy');
    expect(useAuthStore.getState().user).toBeNull();
  });
});
