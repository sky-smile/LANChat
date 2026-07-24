import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, CommentOutlined, IdcardOutlined, TeamOutlined, SafetyOutlined } from '@ant-design/icons';
import api from '@/services/api';
import './Login.css';

const { Text } = Typography;

interface RegisterFormData {
  account: string;
  password: string;
  confirmPassword: string;
  name: string;
  department: string;
}

function Register() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const onFinish = async (values: RegisterFormData) => {
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const resp = await api.post('/auth/register', {
        account: values.account,
        password: values.password,
        name: values.name,
        department: values.department,
        role: 'user',
      });
      if (resp.data.code === 0) {
        message.success('注册成功，请登录');
        navigate('/login');
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      message.error(error.response?.data?.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-branding">
        <div className="login-logo">
          <CommentOutlined />
        </div>
        <h1 className="login-title">LANChat</h1>
        <p className="login-subtitle">局域网安全即时通讯</p>
      </div>
      <Card className="login-card">
        <Form
          form={form}
          name="register"
          onFinish={onFinish}
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="account"
            label="账户 / 手机号"
            rules={[
              { required: true, message: '请输入账户' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的11位手机号' },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="11位手机号"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6位' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="至少6位"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认密码"
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<SafetyOutlined />}
              placeholder="再次输入密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input prefix={<IdcardOutlined />} placeholder="真实姓名" />
          </Form.Item>

          <Form.Item
            name="department"
            label="部门"
            rules={[{ required: true, message: '请输入部门' }]}
          >
            <Input prefix={<TeamOutlined />} placeholder="所属部门" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              注册
            </Button>
          </Form.Item>

          <div className="login-footer">
            <Text type="secondary" className="login-hint">
              已有账号？<a onClick={() => navigate('/login')}>返回登录</a>
            </Text>
          </div>
        </Form>
      </Card>
    </div>
  );
}

export default Register;
