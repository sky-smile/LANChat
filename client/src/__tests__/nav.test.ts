import { describe, it, expect, beforeEach } from 'vitest';
import { useNavStore } from '@/stores/nav';

describe('useNavStore', () => {
  beforeEach(() => {
    useNavStore.setState({ activePanel: 'messages' });
  });

  it('初始面板应为 messages', () => {
    expect(useNavStore.getState().activePanel).toBe('messages');
  });

  it('setActivePanel 应切换面板', () => {
    useNavStore.getState().setActivePanel('contacts');
    expect(useNavStore.getState().activePanel).toBe('contacts');

    useNavStore.getState().setActivePanel('groups');
    expect(useNavStore.getState().activePanel).toBe('groups');

    useNavStore.getState().setActivePanel('settings');
    expect(useNavStore.getState().activePanel).toBe('settings');

    useNavStore.getState().setActivePanel('admin');
    expect(useNavStore.getState().activePanel).toBe('admin');
  });

  it('切换回 messages 面板', () => {
    useNavStore.getState().setActivePanel('contacts');
    useNavStore.getState().setActivePanel('messages');
    expect(useNavStore.getState().activePanel).toBe('messages');
  });
});
