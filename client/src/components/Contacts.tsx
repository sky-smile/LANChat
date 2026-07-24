import { useState, useEffect, useCallback } from 'react';
import { List, Avatar, Input, Spin, Empty } from 'antd';
import {
  UserOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useChatStore } from '@/stores/chat';
import { useContactsStore } from '@/stores/contacts';
import { useNavStore } from '@/stores/nav';
import api from '@/services/api';
import './Contacts.css';

interface ContactItem {
  id: string;
  account: string;
  name: string;
  avatarUrl?: string;
  department: string;
  status: string;
}

function Contacts() {
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { addConversation, setCurrentConversation } = useChatStore();
  const setActivePanel = useNavStore((state) => state.setActivePanel);
  const storeContacts = useContactsStore((state) => state.contacts);
  const setStoreContacts = useContactsStore((state) => state.setContacts);
  // 搜索结果使用本地状态，但渲染时合并 contactsStore 中的实时状态
  const [searchResults, setSearchResults] = useState<ContactItem[]>([]);
  const isSearching = searchQuery.trim().length > 0;

  // 合并搜索结果的实时在线状态
  const displayContacts = isSearching
    ? searchResults.map((c) => {
        const live = storeContacts.find((s) => s.id === c.id);
        return live ? { ...c, status: live.status } : c;
      })
    : storeContacts.map((c) => ({
        id: c.id,
        account: c.account,
        name: c.name,
        avatarUrl: c.avatar,
        department: c.department,
        status: c.status,
      }));

  // 加载所有联系人
  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/auth/users');
      const users = (resp.data.data || []).map((u: Record<string, unknown>) => ({
        id: u.id as string,
        account: u.account as string,
        name: (u.name as string) || '',
        avatarUrl: u.avatar_url as string | undefined,
        department: (u.department as string) || '',
        status: (u.status as string) || 'offline',
      }));
      // 写入 contactsStore 以接收 WebSocket 实时更新
      setStoreContacts(users.map((u: ContactItem) => ({
        id: u.id,
        account: u.account,
        name: u.name || '',
        avatar: u.avatarUrl,
        department: u.department,
        status: u.status as 'online' | 'away' | 'busy' | 'offline',
      })));
    } catch (err) {
      console.error('加载联系人失败', err);
    } finally {
      setLoading(false);
    }
  }, [setStoreContacts]);

  // 搜索用户
  const searchContacts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      loadContacts();
      return;
    }
    setLoading(true);
    try {
      const resp = await api.get('/auth/search', { params: { q: query.trim(), limit: 50 } });
      const users = (resp.data.data || []).map((u: Record<string, unknown>) => ({
        id: u.id as string,
        account: u.account as string,
        name: (u.name as string) || '',
        avatarUrl: u.avatar_url as string | undefined,
        department: (u.department as string) || '',
        status: (u.status as string) || 'offline',
      }));
      setSearchResults(users);
    } catch (err) {
      console.error('搜索用户失败', err);
    } finally {
      setLoading(false);
    }
  }, [loadContacts]);

  // 页面加载时获取所有联系人
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchContacts(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchContacts]);

  // 发起私聊
  const startChat = (contact: ContactItem) => {
    addConversation({
      id: contact.id,
      name: contact.name || contact.account,
      avatar: contact.avatarUrl,
      unreadCount: 0,
      type: 'user',
      status: contact.status,
    });
    setCurrentConversation(contact.id);
    setActivePanel('messages');
  };

  return (
    <div className="contacts-panel">
      <div className="panel-header">
        <h2>联系人</h2>
      </div>
      <div className="panel-search">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索联系人..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          allowClear
        />
      </div>
      <div className="contacts-list-container">
        {loading ? (
          <div className="contacts-loading"><Spin /></div>
        ) : displayContacts.length === 0 ? (
          <div className="panel-empty">
            <Empty description={searchQuery.trim() ? "未找到联系人" : "暂无联系人"} />
          </div>
        ) : (
          <List
            dataSource={displayContacts}
            renderItem={(contact) => (
              <div className="contact-item" onClick={() => startChat(contact)}>
                <Avatar icon={<UserOutlined />} src={contact.avatarUrl} />
                <div className="contact-info">
                  <div className="contact-name">{contact.name || contact.account}</div>
                  <div className="contact-meta">
                    <span className="contact-username">@{contact.account}</span>
                    {contact.department && <span className="contact-dept">{contact.department}</span>}
                  </div>
                </div>
                <div className={`status-dot ${contact.status}`} />
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}

export default Contacts;
