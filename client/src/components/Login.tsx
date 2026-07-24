import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, CommentOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAuthStore } from '../stores/auth';
import './Login.css';

const { Text } = Typography;

interface LoginFormData {
  account: string;
  password: string;
}

function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const onFinish = async (values: LoginFormData) => {
    setLoading(true);
    try {
      await login(values.account, values.password);
      message.success('登录成功');
      navigate('/');
    } catch (error) {
      message.error('登录失败，请检查账户和密码');
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
          name="login"
          initialValues={{ remember: true }}
          onFinish={onFinish}
          size="large"
        >
          <Form.Item
            name="account"
            rules={[
              { required: true, message: '请输入账户' },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="账户 / 手机号"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              登录
            </Button>
          </Form.Item>

          <div className="login-footer">
            <Text type="secondary" className="login-hint">
              <InfoCircleOutlined /> 没有账号？<a onClick={() => navigate('/register')}>立即注册</a>
            </Text>
          </div>
        </Form>
      </Card>
    </div>
  );
}

export default Login;
