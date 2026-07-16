import { useState, useEffect } from 'react';
import { Layout, Form, Input, Button, Avatar, message, Divider, Card } from 'antd';
import { UserOutlined, SaveOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth';
import api from '@/services/api';
import './Settings.css';

const { Content } = Layout;

function Settings() {
  const { user, setUser } = useAuthStore();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

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

  return (
    <Content className="settings-page">
      <div className="settings-header">
        <h2>设置</h2>
      </div>
      <div className="settings-content">
        <Card title="个人资料" className="settings-card">
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

        <Divider />

        <Card title="关于" className="settings-card">
          <div className="settings-about">
            <p><strong>LANChat</strong> v0.1.0</p>
            <p>局域网聊天软件 - 企业内部即时通讯</p>
            <p>技术栈：Rust + React + Tauri</p>
          </div>
        </Card>
      </div>
    </Content>
  );
}

export default Settings;
