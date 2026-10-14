import axios from 'axios';
import { message } from 'antd';

const api = axios.create({
    baseURL: '/api',
    timeout: 30000,
});

// 请求拦截器：自动携带 Token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// 响应拦截器
api.interceptors.response.use(
    (response) => {
        const data = response.data;
        if (data.success === false) {
            message.error(data.message || '请求失败');
            return Promise.reject(new Error(data.message));
        }
        return response;
    },
    (error) => {
        if (error.response?.status === 401) {
            const detail = error.response?.data?.detail;
            if (detail) {
                // 登录/认证失败，展示具体错误信息
                message.error(detail);
            }
            // 仅当不是登录页面请求时才清除 Token 并跳转
            if (!window.location.pathname.includes('/login')) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            }
            return Promise.reject(error);
        }
        const msg = error.response?.data?.detail || error.message || '网络错误';
        message.error(msg);
        return Promise.reject(error);
    }
);

export default api;
