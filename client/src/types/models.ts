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
  /** 是否为系统默认群组（如公司大群，不可删除） */
  isSystem: boolean;
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
