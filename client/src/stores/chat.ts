import { create } from 'zustand';

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  receiverType: 'user' | 'group';
  content: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: Message;
  unreadCount: number;
  type: 'user' | 'group';
}

interface ChatState {
  conversations: Conversation[];
  currentConversation: string | null;
  messages: Record<string, Message[]>;
  setCurrentConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  markAsRead: (conversationId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  currentConversation: null,
  messages: {},

  setCurrentConversation: (id) => {
    set({ currentConversation: id });
  },

  addMessage: (conversationId, message) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] || []), message],
      },
    }));
  },

  setMessages: (conversationId, messages) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: messages,
      },
    }));
  },

  markAsRead: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.map((conv) =>
        conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv,
      ),
    }));
  },
}));
