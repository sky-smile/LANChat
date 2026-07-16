import { create } from 'zustand';
import { useAuthStore } from './auth';

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
  /** 客户端临时 ID（用于消息确认匹配） */
  clientId?: string;
}

export interface Conversation {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: Message;
  unreadCount: number;
  type: 'user' | 'group';
  status?: string;
}

interface ChatState {
  conversations: Conversation[];
  currentConversation: string | null;
  messages: Record<string, Message[]>;
  setCurrentConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  markAsRead: (conversationId: string) => void;
  updateMessageAck: (clientId: string, serverMsgId: string, createdAt: string) => void;
  updateContactStatus: (userId: string, status: string) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversationName: (id: string, name: string) => void;
  markConversationRead: (userId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  currentConversation: null,
  messages: {},

  setCurrentConversation: (id) => {
    set({ currentConversation: id });
  },

  addMessage: (_conversationId, message) => {
    const currentUserId = useAuthStore.getState().user?.id;
    set((state) => {
      // 确定对话的对方 ID
      const otherId = message.senderId === currentUserId ? message.receiverId : message.senderId;

      // 更新或创建会话
      const existingConv = state.conversations.find((c) => c.id === otherId);
      let conversations: Conversation[];

      if (existingConv) {
        conversations = state.conversations.map((c) =>
          c.id === otherId
            ? {
                ...c,
                lastMessage: message,
                unreadCount: state.currentConversation === otherId ? c.unreadCount : c.unreadCount + 1,
              }
            : c,
        );
      } else {
        // 新会话
        const newConv: Conversation = {
          id: otherId,
          name: otherId.slice(0, 8), // 简短显示 ID，后续改为真实用户名
          lastMessage: message,
          unreadCount: state.currentConversation === otherId ? 0 : 1,
          type: message.receiverType,
        };
        conversations = [newConv, ...state.conversations];
      }

      return {
        messages: {
          ...state.messages,
          [otherId]: [...(state.messages[otherId] || []), message],
        },
        conversations,
      };
    });
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

  updateMessageAck: (clientId, serverMsgId, createdAt) => {
    set((state) => {
      const newMessages = { ...state.messages };
      for (const convId of Object.keys(newMessages)) {
        newMessages[convId] = newMessages[convId].map((msg) =>
          msg.clientId === clientId
            ? { ...msg, id: serverMsgId, createdAt, clientId: undefined }
            : msg,
        );
      }
      return { messages: newMessages };
    });
  },

  updateContactStatus: (userId, status) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === userId ? { ...c, status } : c,
      ),
    }));
  },

  addConversation: (conversation) => {
    set((state) => {
      if (state.conversations.find((c) => c.id === conversation.id)) {
        return state;
      }
      return { conversations: [conversation, ...state.conversations] };
    });
  },

  updateConversationName: (id, name) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, name } : c,
      ),
    }));
  },

  markConversationRead: (userId) => {
    set((state) => {
      const convMessages = state.messages[userId];
      if (!convMessages) return state;
      // 将我发给该用户的消息标记为已读
      const updatedMessages = convMessages.map((msg) =>
        msg.receiverId === userId && !msg.isRead ? { ...msg, isRead: true } : msg,
      );
      return {
        messages: {
          ...state.messages,
          [userId]: updatedMessages,
        },
      };
    });
  },
}));
