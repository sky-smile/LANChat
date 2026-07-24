import { useState, useEffect, useCallback } from 'react';
import {
  Modal, List, Avatar, Button, Input, Form, Select, message, Spin, Empty, Tag, Popconfirm, Typography,
} from 'antd';
import { UserOutlined, TeamOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '@/services/api';
import { useAuthStore } from '@/stores/auth';

const { Text } = Typography;

interface GroupMember {
  id: string;
  account: string;
  name: string;
  avatar_url?: string;
  role: string;
  status?: string;
}

interface GroupInfo {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  member_count: number;
  can_manage: boolean;
  created_by: string;
}

interface GroupSettingsProps {
  groupId: string;
  open: boolean;
  onClose: () => void;
  onGroupNameChange?: (name: string) => void;
}

interface ContactOption {
  value: string;
  label: string;
}

function GroupSettings({ groupId, open, onClose, onGroupNameChange }: GroupSettingsProps) {
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const currentUser = useAuthStore((state) => state.user);
  const currentUserId = currentUser?.id;
  const isAdmin = currentUser?.role === 'admin';

  // 加载群组信息和成员列表
  const loadGroupData = useCallback(async () => {
    setLoading(true);
    try {
      const [groupResp, membersResp] = await Promise.all([
        api.get(`/groups/${groupId}`),
        api.get(`/groups/${groupId}/members`),
      ]);
      const group = groupResp.data.data;
      setGroupInfo(group);
      setMembers(membersResp.data.data || []);
      editForm.setFieldsValue({ name: group.name, description: group.description });
    } catch (err) {
      console.error('加载群组信息失败', err);
      message.error('加载群组信息失败');
    } finally {
      setLoading(false);
    }
  }, [groupId, editForm]);

  // 加载联系人列表（用于添加成员）
  const loadContacts = useCallback(async () => {
    try {
      const resp = await api.get('/auth/users');
      const users: ContactOption[] = (resp.data.data || [])
        .filter((u: Record<string, unknown>) => {
          // 过滤掉已经是成员的用户
          const uid = u.id as string;
          return !members.some((m) => m.id === uid);
        })
        .map((u: Record<string, unknown>) => ({
          value: u.id as string,
          label: `${(u.name as string) || (u.account as string)} (@${u.account as string})`,
        }));

      // 如果当前用户不是群组成员，也加入可选列表
      if (currentUser && !members.some((m) => m.id === currentUserId)) {
        const alreadyIncluded = users.some((u) => u.value === currentUserId);
        if (!alreadyIncluded) {
          users.unshift({
            value: currentUserId!,
            label: `${currentUser.name || currentUser.account} (@${currentUser.account}) [我]`,
          });
        }
      }

      setContacts(users);
    } catch (err) {
      console.error('加载联系人失败', err);
    }
  }, [members, currentUser, currentUserId]);

  useEffect(() => {
    if (open) {
      loadGroupData();
    }
  }, [open, loadGroupData]);

  useEffect(() => {
    if (addMemberVisible) {
      loadContacts();
    }
  }, [addMemberVisible, loadContacts]);

  // 修改群组信息
  const handleUpdateGroup = async (values: { name: string; description?: string }) => {
    try {
      await api.put(`/groups/${groupId}`, values);
      message.success('群组信息已更新');
      setEditing(false);
      loadGroupData();
      onGroupNameChange?.(values.name);
    } catch (err) {
      console.error('更新群组信息失败', err);
      message.error('更新群组信息失败');
    }
  };

  // 添加成员
  const handleAddMembers = async (values: { user_ids: string[] }) => {
    try {
      for (const uid of values.user_ids) {
        await api.post(`/groups/${groupId}/members`, { user_id: uid });
      }
      message.success('成员添加成功');
      setAddMemberVisible(false);
      form.resetFields();
      loadGroupData();
    } catch (err) {
      console.error('添加成员失败', err);
      message.error('添加成员失败');
    }
  };

  // 移除成员
  const handleRemoveMember = async (userId: string) => {
    try {
      await api.delete(`/groups/${groupId}/members/${userId}`);
      message.success('成员已移除');
      loadGroupData();
    } catch (err) {
      console.error('移除成员失败', err);
      message.error('移除成员失败');
    }
  };

  if (!open) return null;

  return (
    <Modal
      title="群组设置"
      open={open}
      onCancel={onClose}
      footer={null}
      width={500}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}><Spin /></div>
      ) : !groupInfo ? (
        <Empty description="群组信息加载失败" />
      ) : (
        <>
          {/* 群组信息 */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <Avatar
                size={64}
                icon={<TeamOutlined />}
                src={groupInfo.avatar_url}
                style={{ backgroundColor: '#1890ff', marginRight: 16 }}
              />
              <div>
                {editing ? (
                  <Form form={editForm} onFinish={handleUpdateGroup} layout="inline">
                    <Form.Item name="name" rules={[{ required: true, message: '请输入群组名称' }]}>
                      <Input placeholder="群组名称" maxLength={100} style={{ width: 200 }} />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" htmlType="submit" size="small">保存</Button>
                      <Button size="small" style={{ marginLeft: 8 }} onClick={() => setEditing(false)}>取消</Button>
                    </Form.Item>
                  </Form>
                ) : (
                  <>
                    <Text strong style={{ fontSize: 18 }}>{groupInfo.name}</Text>
                    {groupInfo.can_manage && (
                      <Button type="link" size="small" onClick={() => setEditing(true)}>编辑</Button>
                    )}
                  </>
                )}
                <div>
                  <Text type="secondary">{groupInfo.member_count} 位成员</Text>
                </div>
              </div>
            </div>
            {groupInfo.description && !editing && (
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">{groupInfo.description}</Text>
              </div>
            )}
            {editing && (
              <Form form={editForm} onFinish={handleUpdateGroup} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item name="description" label="群组描述">
                  <Input.TextArea placeholder="群组描述（可选）" rows={2} maxLength={500} />
                </Form.Item>
              </Form>
            )}
          </div>

          {/* 成员列表 */}
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong>群组成员</Text>
            {groupInfo.can_manage && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                size="small"
                onClick={() => setAddMemberVisible(true)}
              >
                添加成员
              </Button>
            )}
          </div>
          <List
            dataSource={members}
            renderItem={(member) => (
              <List.Item
                actions={
                  groupInfo.can_manage && (isAdmin || member.id !== currentUserId)
                    ? [
                        <Popconfirm
                          key="remove"
                          title="确定要移除该成员吗？"
                          onConfirm={() => handleRemoveMember(member.id)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                        </Popconfirm>,
                      ]
                    : undefined
                }
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} src={member.avatar_url} />}
                  title={
                    <span>
                      {member.name || member.account}
                      {member.id === currentUserId && (
                        <Tag color="blue" style={{ marginLeft: 8 }}>我</Tag>
                      )}
                    </span>
                  }
                  description={`@${member.account}`}
                />
              </List.Item>
            )}
          />

          {/* 添加成员弹窗 */}
          <Modal
            title="添加成员"
            open={addMemberVisible}
            onCancel={() => setAddMemberVisible(false)}
            footer={null}
          >
            <Form form={form} onFinish={handleAddMembers} layout="vertical">
              <Form.Item
                name="user_ids"
                label="选择成员"
                rules={[{ required: true, message: '请选择要添加的成员' }]}
              >
                <Select
                  mode="multiple"
                  placeholder="选择要添加的成员"
                  options={contacts}
                  optionFilterProp="label"
                  showSearch
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  添加
                </Button>
              </Form.Item>
            </Form>
          </Modal>
        </>
      )}
    </Modal>
  );
}

export default GroupSettings;
