import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Input,
  Space,
  Modal,
  Form,
  Select,
  message,
  Popconfirm,
  Tag,
  Avatar,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import api from '@/services/api';
import './Admin.css';

interface AdminUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  department: string | null;
  role: string;
  status: string;
  created_at: string;
}

interface UserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // 模态框状态
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  // 编辑弹窗打开后设置表单初始值
  useEffect(() => {
    if (editModalOpen && editingUser) {
      // 使用 setTimeout 确保 Form 已挂载
      setTimeout(() => {
        editForm.setFieldsValue({
          display_name: editingUser.display_name || '',
          department: editingUser.department || '',
          role: editingUser.role,
        });
      }, 0);
    }
  }, [editModalOpen, editingUser, editForm]);

  // 加载用户列表
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, page_size: pageSize };
      if (search) params.search = search;
      const resp = await api.get<{ code: number; data: UserListResponse }>('/admin/users', { params });
      if (resp.data.code === 0) {
        // 超级管理员置顶
        const sorted = [...resp.data.data.users].sort((a, b) => {
          if (a.username === 'admin') return -1;
          if (b.username === 'admin') return 1;
          return 0;
        });
        setUsers(sorted);
        setTotal(resp.data.data.total);
      }
    } catch (err) {
      console.error('获取用户列表失败', err);
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 创建用户
  const handleCreate = async (values: { username: string; password: string; display_name?: string; department?: string; role?: string }) => {
    try {
      const resp = await api.post('/admin/users', values);
      if (resp.data.code === 0) {
        message.success('用户创建成功');
        setCreateModalOpen(false);
        createForm.resetFields();
        fetchUsers();
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      message.error(error.response?.data?.message || '创建失败');
    }
  };

  // 编辑用户
  const handleEdit = async (values: { display_name?: string; department?: string; role?: string }) => {
    if (!editingUser) return;
    try {
      const resp = await api.put(`/admin/users/${editingUser.id}`, values);
      if (resp.data.code === 0) {
        message.success('用户更新成功');
        setEditModalOpen(false);
        editForm.resetFields();
        fetchUsers();
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      message.error(error.response?.data?.message || '更新失败');
    }
  };

  // 删除用户
  const handleDelete = async (userId: string) => {
    try {
      const resp = await api.delete(`/admin/users/${userId}`);
      if (resp.data.code === 0) {
        message.success('用户已删除');
        fetchUsers();
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      message.error(error.response?.data?.message || '删除失败');
    }
  };

  // 重置密码
  const handleResetPassword = async (values: { new_password: string }) => {
    if (!editingUser) return;
    try {
      const resp = await api.post(`/admin/users/${editingUser.id}/reset-password`, values);
      if (resp.data.code === 0) {
        message.success('密码已重置');
        setPasswordModalOpen(false);
        passwordForm.resetFields();
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      message.error(error.response?.data?.message || '重置失败');
    }
  };

  const openEditModal = (user: AdminUser) => {
    setEditingUser(user);
    setEditModalOpen(true);
  };

  const openPasswordModal = (user: AdminUser) => {
    setEditingUser(user);
    passwordForm.resetFields();
    setPasswordModalOpen(true);
  };

  const columns = [
    {
      title: '用户',
      key: 'user',
      render: (_: unknown, record: AdminUser) => (
        <Space>
          <Avatar icon={<UserOutlined />} src={record.avatar_url} size={32} />
          <div>
            <div style={{ fontWeight: 500 }}>{record.display_name || record.username}</div>
            <div style={{ fontSize: 12, color: '#999' }}>@{record.username}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      render: (dept: string | null) => dept || '-',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string, record: AdminUser) => {
        if (record.username === 'admin') {
          return <Tag color="gold">超级管理员</Tag>;
        }
        return (
          <Tag color={role === 'admin' ? 'red' : 'blue'}>
            {role === 'admin' ? '管理员' : '用户'}
          </Tag>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'online' ? 'green' : 'default'}>
          {status === 'online' ? '在线' : '离线'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: AdminUser) => {
        const isProtected = record.username === 'admin';
        return (
          <Space>
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              title="编辑"
            />
            <Button
              type="text"
              icon={<KeyOutlined />}
              onClick={() => openPasswordModal(record)}
              title="重置密码"
            />
            {!isProtected && (
              <Popconfirm
                title="确定删除此用户？"
                description="删除后不可恢复"
                onConfirm={() => handleDelete(record.id)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button type="text" danger icon={<DeleteOutlined />} title="删除" />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2><TeamOutlined /> 用户管理</h2>
        <Space>
          <Input
            placeholder="搜索用户..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            allowClear
            style={{ width: 240 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            创建用户
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 个用户`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      {/* 创建用户弹窗 */}
      <Modal
        title="创建用户"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} onFinish={handleCreate} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="英文字母和数字" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
            <Input.Password placeholder="初始密码" />
          </Form.Item>
          <Form.Item name="display_name" label="显示名称">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="user">
            <Select options={[{ value: 'user', label: '用户' }, { value: 'admin', label: '管理员' }]} />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setCreateModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">创建</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑用户弹窗 */}
      <Modal
        title="编辑用户"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={editForm} onFinish={handleEdit} layout="vertical">
          <Form.Item name="display_name" label="显示名称">
            <Input />
          </Form.Item>
          <Form.Item name="department" label="部门">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select
              options={[{ value: 'user', label: '用户' }, { value: 'admin', label: '管理员' }]}
              disabled={editingUser?.username === 'admin'}
            />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setEditModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal
        title={`重置密码 - ${editingUser?.display_name || editingUser?.username}`}
        open={passwordModalOpen}
        onCancel={() => setPasswordModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={passwordForm} onFinish={handleResetPassword} layout="vertical">
          <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
            <Input.Password placeholder="输入新密码" />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setPasswordModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" danger>重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default Admin;
