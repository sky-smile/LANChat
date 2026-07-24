import { useState, useEffect } from 'react';
import { Form, Input, Button, Avatar, message, Card, Switch, Tag, Descriptions, Typography } from 'antd';
import { UserOutlined, SaveOutlined, BellOutlined, ApiOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth';
import api from '@/services/api';
import './Settings.css';

const { Text } = Typography;

function Settings() {
  const { user, setUser } = useAuthStore();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [notifySound, setNotifySound] = useState(() => {
    return localStorage.getItem('lanchat-notify-sound') !== 'off';
  });

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        account: user.account,
        name: user.name,
        department: user.department,
      });
    }
  }, [user, form]);

  const handleSave = async (values: { name: string; department: string }) => {
    setSaving(true);
    try {
      const resp = await api.put('/auth/me', {
        name: values.name,
        department: values.department,
      });
      if (resp.data.code === 0) {
        const updated = resp.data.data;
        setUser({
          ...user!,
          name: updated.name,
          department: updated.department,
        });
        message.success('保存成功');
      }
    } catch (err) {
      console.error('保存失败', err);
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyChange = (checked: boolean) => {
    setNotifySound(checked);
    localStorage.setItem('lanchat-notify-sound', checked ? 'on' : 'off');
    message.success(checked ? '已开启消息提示音' : '已关闭消息提示音');
  };

  const serverHost = import.meta.env.VITE_API_URL || `${window.location.hostname}:3000`;

  const statusMap: Record<string, { color: string; label: string }> = {
    online: { color: 'success', label: '在线' },
    offline: { color: 'default', label: '离线' },
    away: { color: 'warning', label: '离开' },
    busy: { color: 'error', label: '忙碌' },
  };
  const currentStatus = statusMap[user?.status || 'offline'];

  return (
    <div className="settings-page">
      <div className="panel-header">
        <h2>设置</h2>
      </div>
      <div className="settings-content">
        <Card
          title={
            <span className="settings-card-title">
              <UserOutlined /> 个人资料
            </span>
          }
          className="settings-card"
        >
          <div className="settings-avatar">
            <Avatar size={80} icon={<UserOutlined />} src={user?.avatarUrl} />
          </div>
          <Form form={form} onFinish={handleSave} layout="vertical">
            <Form.Item label="账户 / 手机号">
              <Input value={user?.account} disabled />
            </Form.Item>
            <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
              <Input placeholder="设置你的姓名" maxLength={50} />
            </Form.Item>
            <Form.Item name="department" label="部门" rules={[{ required: true, message: '请输入部门' }]}>
              <Input placeholder="设置你的部门" maxLength={50} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                保存
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Card
          title={
            <span className="settings-card-title">
              <BellOutlined /> 通知设置
            </span>
          }
          className="settings-card"
        >
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">消息提示音</div>
              <div className="settings-row-desc">收到新消息时播放提示音</div>
            </div>
            <Switch checked={notifySound} onChange={handleNotifyChange} />
          </div>
        </Card>

        <Card
          title={
            <span className="settings-card-title">
              <ApiOutlined /> 账户信息
            </span>
          }
          className="settings-card"
        >
          <Descriptions column={1} size="small" className="settings-descriptions">
            <Descriptions.Item label="服务器地址">
              <Text className="settings-mono" copyable={{ text: serverHost }}>
                {serverHost}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="当前状态">
              <Tag color={currentStatus.color}>{currentStatus.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="用户 ID">
              <Text copyable={{ text: user?.id }} className="settings-mono">
                {user?.id}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          title={
            <span className="settings-card-title">
              <InfoCircleOutlined /> 关于
            </span>
          }
          className="settings-card"
        >
          <div className="settings-about">
            <p><strong>LANChat</strong> <Tag>v0.1.0</Tag></p>
            <p>局域网安全即时通讯</p>
            <p className="settings-tech">Rust + React + Tauri</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Settings;
