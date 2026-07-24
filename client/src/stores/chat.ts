import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './auth';

export interface Message {
  id: string;
  senderId: string;
  senderName?: string;
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
  groupMemberCount?: number;
  /** 是否为系统默认群组（置顶显示，不可删除） */
  isSystem?: boolean;
  /** 是否已归档（群组被解散后归档，可查看历史但不可发消息） */
  archived?: boolean;
}

interface ChatState {
  conversations: Conversation[];
  currentConversation: string | null;
  messages: Record<string, Message[]>;
  setCurrentConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  prependMessages: (conversationId: string, olderMessages: Message[]) => void;
  markAsRead: (conversationId: string) => void;
  updateMessageAck: (clientId: string, serverMsgId: string, createdAt: string) => void;
  updateContactStatus: (userId: string, status: string) => void;
  addConversation: (conversation: Conversation) => void;
  removeConversation: (id: string) => void;
  archiveConversation: (id: string) => void;
  updateConversationName: (id: string, name: string) => void;
  markConversationRead: (userId: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      conversations: [],
      currentConversation: null,
      messages: {},

      setCurrentConversation: (id) => {
        set({ currentConversation: id });
      },

      addMessage: (_conversationId, message) => {
        const currentUserId = useAuthStore.getState().user?.id;
        set((state) => {
          // 群组消息：会话 ID 就是群组 ID（receiverId）
          // 私聊消息：会话 ID 是对方 ID
          const convId = message.receiverType === 'group'
            ? message.receiverId
            : (message.senderId === currentUserId ? message.receiverId : message.senderId);

          // 更新或创建会话
          const existingConv = state.conversations.find((c) => c.id === convId);
          let conversations: Conversation[];

          if (existingConv) {
            conversations = state.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    lastMessage: message,
                    unreadCount: state.currentConversation === convId ? c.unreadCount : c.unreadCount + 1,
                  }
                : c,
            );
          } else {
            // 新会话
            const newConv: Conversation = {
              id: convId,
              name: message.receiverType === 'group'
                ? '加载中...'
                : (message.senderName || convId.slice(0, 8)),
              lastMessage: message,
              unreadCount: state.currentConversation === convId ? 0 : 1,
              type: message.receiverType,
            };
            conversations = [newConv, ...state.conversations];
          }

          return {
            messages: {
              ...state.messages,
              [convId]: [...(state.messages[convId] || []), message],
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

      prependMessages: (conversationId, olderMessages) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: [...olderMessages, ...(state.messages[conversationId] || [])],
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
            // 更新已有会话的状态
            return {
              conversations: state.conversations.map((c) =>
                c.id === conversation.id
                  ? { ...c, ...conversation, lastMessage: c.lastMessage, unreadCount: c.unreadCount }
                  : c,
              ),
            };
          }
          return { conversations: [conversation, ...state.conversations] };
        });
      },

      removeConversation: (id) => {
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
          currentConversation: state.currentConversation === id ? null : state.currentConversation,
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          messages: (({ [id]: _, ...rest }) => rest)(state.messages),
        }));
      },

      archiveConversation: (id) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, archived: true } : c,
          ),
        }));
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

      reset: () => {
        set({
          conversations: [],
          currentConversation: null,
          messages: {},
        });
        // 清除持久化的聊天存储
        localStorage.removeItem('chat-storage');
      },
    }),
    {
      name: 'chat-storage',
      // 只持久化会话列表，不持久化消息（消息从服务器加载）
      partialize: (state) => ({
        conversations: state.conversations,
      }),
    },
  ),
);
