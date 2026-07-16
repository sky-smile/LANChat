import { useState, useEffect, useCallback } from 'react';
import { Layout, List, Avatar, Tabs, Button, Input, Modal, Form, message, Spin, Empty } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/stores/chat';
import api from '@/services/api';
import './Contacts.css';

const { Content } = Layout;

interface ContactItem {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  department?: string;
  status: string;
}

interface GroupItem {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  memberCount?: number;
}

function Contacts() {
  const [activeTab, setActiveTab] = useState('contacts');
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { addConversation, setCurrentConversation } = useChatStore();

  // 加载群组列表
  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/groups');
      setGroups(resp.data.data || []);
    } catch (err) {
      console.error('加载群组失败', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 搜索用户
  const searchContacts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setContacts([]);
      return;
    }
    setLoading(true);
    try {
      const resp = await api.get('/auth/search', { params: { q: query.trim(), limit: 50 } });
      const users = (resp.data.data || []).map((u: Record<string, unknown>) => ({
        id: u.id as string,
        username: u.username as string,
        displayName: (u.display_name as string) || '',
        avatarUrl: u.avatar_url as string | undefined,
        department: u.department as string | undefined,
        status: (u.status as string) || 'offline',
      }));
      setContacts(users);
    } catch (err) {
      console.error('搜索用户失败', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'groups') {
      loadGroups();
    }
  }, [activeTab, loadGroups]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'contacts') {
        searchContacts(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, activeTab, searchContacts]);

  // 发起私聊
  const startChat = (contact: ContactItem) => {
    addConversation({
      id: contact.id,
      name: contact.displayName || contact.username,
      avatar: contact.avatarUrl,
      unreadCount: 0,
      type: 'user',
      status: contact.status,
    });
    setCurrentConversation(contact.id);
    navigate('/');
  };

  // 进入群聊
  const enterGroup = (group: GroupItem) => {
    addConversation({
      id: group.id,
      name: group.name,
      avatar: group.avatarUrl,
      unreadCount: 0,
      type: 'group',
    });
    setCurrentConversation(group.id);
    navigate('/');
  };

  // 创建群组
  const handleCreateGroup = async (values: { name: string; description?: string }) => {
    setCreatingGroup(true);
    try {
      const resp = await api.post('/groups', {
        name: values.name,
        description: values.description || null,
      });
      const newGroup = resp.data.data;
      message.success(`群组「${newGroup.name}」创建成功`);
      setCreateGroupVisible(false);
      form.resetFields();
      loadGroups();
    } catch (err) {
      console.error('创建群组失败', err);
      message.error('创建群组失败');
    } finally {
      setCreatingGroup(false);
    }
  };

  const tabItems = [
    {
      key: 'contacts',
      label: '联系人',
      children: (
        <div className="contacts-list-container">
          <div className="contacts-search">
            <Input
              prefix={<SearchOutlined />}
              placeholder="搜索用户..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              allowClear
            />
          </div>
          {loading ? (
            <div className="contacts-loading"><Spin /></div>
          ) : contacts.length === 0 ? (
            <Empty description={searchQuery ? '未找到用户' : '输入用户名搜索'} />
          ) : (
            <List
              dataSource={contacts}
              renderItem={(contact) => (
                <div className="contact-item" onClick={() => startChat(contact)}>
                  <Avatar icon={<UserOutlined />} src={contact.avatarUrl} />
                  <div className="contact-info">
                    <div className="contact-name">{contact.displayName || contact.username}</div>
                    <div className="contact-meta">
                      <span className="contact-username">@{contact.username}</span>
                      {contact.department && <span className="contact-dept">{contact.department}</span>}
                    </div>
                  </div>
                  <div className={`status-dot ${contact.status}`} />
                </div>
              )}
            />
          )}
        </div>
      ),
    },
    {
      key: 'groups',
      label: '群组',
      children: (
        <div className="contacts-list-container">
          <div className="contacts-toolbar">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="small"
              onClick={() => setCreateGroupVisible(true)}
            >
              创建群组
            </Button>
          </div>
          {loading ? (
            <div className="contacts-loading"><Spin /></div>
          ) : groups.length === 0 ? (
            <Empty description="暂无群组" />
          ) : (
            <List
              dataSource={groups}
              renderItem={(group) => (
                <div className="contact-item" onClick={() => enterGroup(group)}>
                  <Avatar icon={<TeamOutlined />} src={group.avatarUrl} />
                  <div className="contact-info">
                    <div className="contact-name">{group.name}</div>
                    <div className="contact-meta">
                      {group.description && <span>{group.description}</span>}
                    </div>
                  </div>
                </div>
              )}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <Content className="contacts-page">
      <div className="contacts-header">
        <h2>通讯录</h2>
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        className="contacts-tabs"
      />
      <Modal
        title="创建群组"
        open={createGroupVisible}
        onCancel={() => setCreateGroupVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleCreateGroup} layout="vertical">
          <Form.Item
            name="name"
            label="群组名称"
            rules={[{ required: true, message: '请输入群组名称' }]}
          >
            <Input placeholder="输入群组名称" maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label="群组描述">
            <Input.TextArea placeholder="输入群组描述（可选）" rows={3} maxLength={500} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creatingGroup} block>
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </Content>
  );
}

export default Contacts;
