import { useState, useEffect, useCallback } from 'react';
import { List, Avatar, Button, Input, Modal, Form, Select, message, Spin, Empty, Popconfirm, Tag } from 'antd';
import {
  TeamOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import GroupSettings from './GroupSettings';
import { useChatStore } from '@/stores/chat';
import { useAuthStore } from '@/stores/auth';
import { useNavStore } from '@/stores/nav';
import api from '@/services/api';
import './Groups.css';

interface GroupItem {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  memberCount?: number;
  isMember?: boolean;
  isSystem?: boolean;
}

interface ContactItem {
  id: string;
  account: string;
  name: string;
  avatarUrl?: string;
  department: string;
  status: string;
}

function Groups() {
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createGroupVisible, setCreateGroupVisible] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [settingsGroupId, setSettingsGroupId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const { addConversation, setCurrentConversation } = useChatStore();
  const setActivePanel = useNavStore((state) => state.setActivePanel);
  const currentUser = useAuthStore((state) => state.user);
  const isAdmin = currentUser?.role === 'admin';

  // 加载群组列表
  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get('/groups');
      const groupsData = (resp.data.data || []).map((g: Record<string, unknown>) => ({
        id: g.id as string,
        name: g.name as string,
        description: g.description as string | undefined,
        avatarUrl: g.avatar_url as string | undefined,
        memberCount: g.member_count as number | undefined,
        isMember: g.is_member as boolean | undefined,
        isSystem: g.is_system as boolean | undefined,
      }));
      setGroups(groupsData);
    } catch (err) {
      console.error('加载群组失败', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载联系人（用于创建群组时选择成员）
  const loadContacts = useCallback(async () => {
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
      setContacts(users);
    } catch (err) {
      console.error('加载联系人失败', err);
    }
  }, []);

  useEffect(() => {
    loadGroups();
    loadContacts();
  }, [loadGroups, loadContacts]);

  // 进入群聊（管理员非成员只能打开设置）
  const enterGroup = (group: GroupItem) => {
    // 管理员不在群组中时，只打开设置
    if (isAdmin && group.isMember === false) {
      setSettingsGroupId(group.id);
      return;
    }
    addConversation({
      id: group.id,
      name: group.name,
      avatar: group.avatarUrl,
      unreadCount: 0,
      type: 'group',
      groupMemberCount: group.memberCount,
      isSystem: group.isSystem,
    });
    setCurrentConversation(group.id);
    setActivePanel('messages');
  };

  // 创建群组
  const handleCreateGroup = async (values: { name: string; description?: string; member_ids?: string[] }) => {
    setCreatingGroup(true);
    try {
      const resp = await api.post('/groups', {
        name: values.name,
        description: values.description || null,
        member_ids: values.member_ids || [],
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

  // 联系人选项（包含当前用户/管理员）
  const contactOptions = [
    ...(currentUser
      ? [{ value: currentUser.id, label: `${currentUser.name || currentUser.account} (@${currentUser.account})` }]
      : []),
    ...contacts.map((c) => ({
      value: c.id,
      label: `${c.name || c.account} (@${c.account})`,
    })),
  ];

  // 删除群组
  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    try {
      await api.delete(`/groups/${groupId}`);
      message.success(`群组「${groupName}」已解散`);
      // 归档会话（保留历史消息，标记为已解散）
      useChatStore.getState().archiveConversation(groupId);
      loadGroups();
    } catch (err) {
      console.error('解散群组失败', err);
      message.error('解散群组失败');
    }
  };

  // 搜索过滤后的群组，系统群组置顶
  const filteredGroups = (searchQuery.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : groups
  ).sort((a, b) => {
    if (a.isSystem && !b.isSystem) return -1;
    if (!a.isSystem && b.isSystem) return 1;
    return 0;
  });

  return (
    <div className="groups-page">
      <div className="groups-header">
        <h2>群组</h2>
        {isAdmin && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={() => setCreateGroupVisible(true)}
          >
            创建群组
          </Button>
        )}
      </div>
      <div className="groups-search">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索群组..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          allowClear
        />
      </div>
      <div className="groups-list-container">
        {loading ? (
          <div className="groups-loading"><Spin /></div>
        ) : filteredGroups.length === 0 ? (
          <div className="panel-empty">
            <Empty description={searchQuery.trim() ? "未找到群组" : "暂无群组"} />
          </div>
        ) : (
          <List
            dataSource={filteredGroups}
            renderItem={(group) => (
              <div className="group-item" onClick={() => enterGroup(group)}>
                <Avatar icon={<TeamOutlined />} src={group.avatarUrl} style={{ backgroundColor: '#1890ff' }} />
                <div className="group-info">
                  <div className="group-name">
                    {group.name}
                    {group.isSystem && (
                      <Tag color="gold" style={{ marginLeft: 8 }}>系统</Tag>
                    )}
                    {isAdmin && group.isMember === false && (
                      <Tag color="orange" style={{ marginLeft: 8 }}>非成员</Tag>
                    )}
                  </div>
                  <div className="group-meta">
                    {group.description && <span>{group.description}</span>}
                    {group.memberCount !== undefined && (
                      <span className="group-member-count">{group.memberCount} 位成员</span>
                    )}
                  </div>
                </div>
                <div className="group-actions">
                  <Button
                    type="text"
                    icon={<SettingOutlined />}
                    size="small"
                    title="群组设置"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSettingsGroupId(group.id);
                    }}
                  />
                  {isAdmin && !group.isSystem && (
                    <Popconfirm
                      title="确认删除"
                      description={`确定要删除群组「${group.name}」吗？此操作不可恢复。`}
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        handleDeleteGroup(group.id, group.name);
                      }}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        size="small"
                        title="删除群组"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  )}
                </div>
              </div>
            )}
          />
        )}
      </div>

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
          <Form.Item name="member_ids" label="添加成员">
            <Select
              mode="multiple"
              placeholder="选择要添加的成员"
              options={contactOptions}
              optionFilterProp="label"
              showSearch
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={creatingGroup} block>
              创建
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {settingsGroupId && (
        <GroupSettings
          groupId={settingsGroupId}
          open={!!settingsGroupId}
          onClose={() => setSettingsGroupId(null)}
          onGroupNameChange={() => loadGroups()}
        />
      )}
    </div>
  );
}

export default Groups;
