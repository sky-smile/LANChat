import axios from 'axios';

// 生产环境使用 VITE_API_URL 环境变量，开发环境使用代理
const baseURL = import.meta.env.DEV 
  ? '/api' 
  : (import.meta.env.VITE_API_URL 
    ? `${import.meta.env.VITE_API_URL}/api` 
    : '/api');

const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加认证 token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth-storage');
    if (token) {
      try {
        const authData = JSON.parse(token);
        if (authData.state?.token) {
          config.headers.Authorization = `Bearer ${authData.state.token}`;
        }
      } catch {
        // 解析失败，忽略
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// 响应拦截器：处理错误
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const errorCode = error.response?.data?.error?.error_code;
      
      // 区分处理不同类型的认证错误
      switch (errorCode) {
        case 'TOKEN_EXPIRED':
        case 'UNAUTHORIZED':
          // Token 过期或未携带 → 清除状态，跳转登录
          localStorage.removeItem('auth-storage');
          window.location.href = '/login';
          break;
        case 'INVALID_CREDENTIALS':
          // 密码错误 → 不自动跳转，让调用方处理错误提示
          break;
        default:
          // 其他 401 错误 → 清除状态，跳转登录
          localStorage.removeItem('auth-storage');
          window.location.href = '/login';
          break;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
