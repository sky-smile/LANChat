import { create } from 'zustand';

/** 中间面板类型 */
export type PanelType = 'messages' | 'contacts' | 'groups' | 'settings' | 'admin';

interface NavState {
  /** 当前激活的中间面板 */
  activePanel: PanelType;
  /** 设置激活面板 */
  setActivePanel: (panel: PanelType) => void;
}

export const useNavStore = create<NavState>((set) => ({
  activePanel: 'messages',
  setActivePanel: (panel) => set({ activePanel: panel }),
}));
