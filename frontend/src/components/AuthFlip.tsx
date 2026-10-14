import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, KeyOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import InteractiveBackground from '../components/InteractiveBackground';

interface AuthFlipProps {
    initialFace?: 'login' | 'register';
}

const AuthFlip: React.FC<AuthFlipProps> = ({ initialFace = 'login' }) => {
    const navigate = useNavigate();
    const { login, guestLogin, register, isAuthenticated } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [face, setFace] = useState<'login' | 'register'>(initialFace);
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        if (isAuthenticated) {
            navigate('/', { replace: true });
        }
    }, [isAuthenticated, navigate]);

    const handleLogin = async (values: { username: string; password: string }) => {
        setLoading(true);
        try {
            const user = await login(values);
            message.success(`欢迎回来，${user.username}！`);
            navigate(user.needs_company ? '/complete-profile' : '/', { replace: true });
        } catch (err: any) {
            // 错误已在拦截器中处理
        } finally {
            setLoading(false);
        }
    };

    const handleGuestLogin = async () => {
        setLoading(true);
        try {
            const user = await guestLogin();
            message.success(`游客登录成功，欢迎${user.username}！退出后使用痕迹将自动清除`);
            navigate('/', { replace: true });
        } catch (err: any) {
            // 错误已在拦截器中处理
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (values: {
        username: string;
        email: string;
        password: string;
        confirmPassword: string;
        invitation_code: string;
    }) => {
        setLoading(true);
        try {
            const result = await register({
                username: values.username,
                password: values.password,
                email: values.email,
                invitation_code: values.invitation_code,
            });
            message.success(`注册成功，角色：${result.role === 'admin' ? '管理员' : '用户'}，请登录`);
            setFace('login');
        } catch (err: any) {
            // 错误已在拦截器中处理
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-background" aria-hidden="true" />
            <InteractiveBackground />
            <button
                type="button"
                className="theme-fab"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            >
                {theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
            </button>
            <div className="auth-flip">
                <div className={`auth-flip-inner ${face === 'register' ? 'is-flipped' : ''}`}>
                    {/* 正面：登录 */}
                    <div className="auth-face auth-face-front">
                        <div style={{ textAlign: 'center', marginBottom: 28 }}>
                            <div className="auth-logo">💬</div>
                            <div className="auth-title">智能客服话术库系统</div>
                            <div className="auth-subtitle">欢迎回来，请登录您的账号</div>
                        </div>

                        <Form layout="vertical" size="large" autoComplete="off" onFinish={handleLogin}>
                            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                                <Input className="craft-field" prefix={<UserOutlined />} placeholder="用户名" autoFocus={face === 'login'} />
                            </Form.Item>
                            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                                <Input.Password className="craft-field" prefix={<LockOutlined />} placeholder="密码" />
                            </Form.Item>

                            <Form.Item style={{ marginBottom: 12 }}>
                                <Button type="primary" htmlType="submit" loading={loading} block>
                                    登 录
                                </Button>
                            </Form.Item>
                            <Form.Item style={{ marginBottom: 4 }}>
                                <Button type="default" block loading={loading} onClick={handleGuestLogin}>
                                    游客登录
                                </Button>
                            </Form.Item>
                        </Form>

                        <div className="auth-footnote">
                            <span aria-hidden>🕊️</span>
                            <span>游客模式不保留任何数据：可自由体验话术库与分类管理，退出后自动清除</span>
                        </div>

                        <div className="auth-switch">
                            <span>没有账号？</span>
                            <button type="button" className="auth-switch-link" onClick={() => setFace('register')}>
                                立即注册
                            </button>
                        </div>
                    </div>

                    {/* 背面：注册 */}
                    <div className="auth-face auth-face-back">
                        <div style={{ textAlign: 'center', marginBottom: 24 }}>
                            <div className="auth-logo">💬</div>
                            <div className="auth-title">创建账号</div>
                            <div className="auth-subtitle">使用邀请码快速加入</div>
                        </div>

                        <Form layout="vertical" size="large" autoComplete="off" onFinish={handleRegister}>
                            <div className="register-grid">
                                <Form.Item
                                    name="username"
                                    rules={[
                                        { required: true, message: '请输入用户名' },
                                        { min: 2, message: '用户名至少2个字符' },
                                        { pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, message: '用户名只能包含字母、数字、下划线和中文' },
                                    ]}
                                >
                                    <Input className="craft-field" prefix={<UserOutlined />} placeholder="用户名" autoFocus={face === 'register'} />
                                </Form.Item>
                                <Form.Item
                                    name="email"
                                    rules={[
                                        { required: true, message: '请输入邮箱' },
                                        { type: 'email', message: '请输入有效的邮箱地址' },
                                    ]}
                                >
                                    <Input className="craft-field" prefix={<MailOutlined />} placeholder="邮箱" />
                                </Form.Item>
                                <Form.Item
                                    name="password"
                                    rules={[
                                        { required: true, message: '请输入密码' },
                                        { min: 6, message: '密码至少6位' },
                                    ]}
                                >
                                    <Input.Password className="craft-field" prefix={<LockOutlined />} placeholder="密码（至少6位）" />
                                </Form.Item>
                                <Form.Item
                                    name="confirmPassword"
                                    dependencies={['password']}
                                    rules={[
                                        { required: true, message: '请确认密码' },
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
                                    <Input.Password className="craft-field" prefix={<LockOutlined />} placeholder="确认密码" />
                                </Form.Item>
                            </div>

                            <Form.Item name="invitation_code" rules={[{ required: true, message: '请输入邀请码' }]}>
                                <Input className="craft-field" prefix={<KeyOutlined />} placeholder="邀请码" />
                            </Form.Item>

                            <Form.Item style={{ marginBottom: 12 }}>
                                <Button type="primary" htmlType="submit" loading={loading} block>
                                    注 册
                                </Button>
                            </Form.Item>
                        </Form>

                        <div className="auth-footnote">
                            <span aria-hidden>🔐</span>
                            <span>注册后需填写公司名称与公司数据库密码；公司名称一经填写不可修改，请谨慎填写</span>
                        </div>

                        <div className="auth-switch">
                            <span>已有账号？</span>
                            <button type="button" className="auth-switch-link" onClick={() => setFace('login')}>
                                前往登录
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthFlip;
