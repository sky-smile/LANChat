import { useState, useEffect } from 'react';
import { Form, Input, Button, Avatar, message, Card, Switch, Tag, Descriptions, Typography } from 'antd';
import { UserOutlined, SaveOutlined, BellOutlined, ApiOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;
import { useAuthStore } from '@/stores/auth';
import api from '@/services/api';
import './Settings.css';

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
        username: user.username,
        displayName: user.displayName || '',
      });
    }
  }, [user, form]);

  const handleSave = async (values: { displayName: string }) => {
    setSaving(true);
    try {
      const resp = await api.put('/auth/me', {
        display_name: values.displayName || null,
      });
      if (resp.data.code === 0) {
        const updated = resp.data.data;
        setUser({
          ...user!,
          displayName: updated.display_name || '',
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

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h2>设置</h2>
      </div>
      <div className="settings-content">
        <Card title={<><UserOutlined /> 个人资料</>} className="settings-card">
          <div className="settings-avatar">
            <Avatar size={80} icon={<UserOutlined />} src={user?.avatarUrl} />
          </div>
          <Form form={form} onFinish={handleSave} layout="vertical">
            <Form.Item label="用户名">
              <Input value={user?.username} disabled />
            </Form.Item>
            <Form.Item name="displayName" label="显示名称">
              <Input placeholder="设置你的显示名称" maxLength={50} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                保存
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Card title={<><BellOutlined /> 通知设置</>} className="settings-card">
          <div className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-title">消息提示音</div>
              <div className="settings-row-desc">收到新消息时播放提示音</div>
            </div>
            <Switch checked={notifySound} onChange={handleNotifyChange} />
          </div>
        </Card>

        <Card title={<><ApiOutlined /> 连接状态</>} className="settings-card">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="服务器地址">
              {window.location.hostname}:3000
            </Descriptions.Item>
            <Descriptions.Item label="连接状态">
              <Tag color="green">已连接</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="用户 ID">
              <Text copyable={{ text: user?.id }} className="settings-mono">
                {user?.id?.slice(0, 8)}...
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={<><InfoCircleOutlined /> 关于</>} className="settings-card">
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
