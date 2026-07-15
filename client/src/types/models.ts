export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  department?: string;
  role: string;
  status: string;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  groupType: string;
  maxMembers: number;
  createdBy: string;
  createdAt: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  receiverType: 'user' | 'group';
  content?: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}
