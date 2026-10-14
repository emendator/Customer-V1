import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Alert, Radio } from 'antd';
import { ShopOutlined, SafetyOutlined, PlusOutlined, LoginOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import InteractiveBackground from '../components/InteractiveBackground';

const { Title, Text } = Typography;

const CompleteProfile: React.FC = () => {
    const navigate = useNavigate();
    const { completeProfile, user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [loading, setLoading] = useState(false);
    // 管理员可选择「新注册公司」或「登录公司」；普通用户只能加入已有公司
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const [mode, setMode] = useState<'create' | 'join'>(isAdmin ? 'create' : 'join');

    const onFinish = async (values: { company_name: string; company_password: string }) => {
        setLoading(true);
        try {
            await completeProfile(values.company_name, values.company_password, mode);
            message.success(mode === 'create' ? '新公司创建成功' : '公司信息已保存');
            navigate('/', { replace: true });
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
            <Card className="auth-card" bordered={false}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div className="auth-logo">🏢</div>
                    <div className="auth-title">完善公司信息</div>
                    <div className="auth-subtitle">
                        {isAdmin
                            ? '管理员可创建新公司或登录已有公司'
                            : '请填写公司名称和公司数据库密码（由公司管理员提供，只能加入已有公司）'}
                    </div>
                </div>

                <Alert
                    type="warning"
                    showIcon
                    message="公司名称一经填写不可修改，请确认填写正确；公司数据库密码可联系管理员修改。"
                    style={{ marginBottom: 24 }}
                />

                <Form
                    name="complete-profile"
                    onFinish={onFinish}
                    layout="vertical"
                    size="large"
                    autoComplete="off"
                >
                    {isAdmin && (
                        <Form.Item label="公司类型" style={{ marginBottom: 24 }}>
                            <Radio.Group
                                value={mode}
                                onChange={(e) => setMode(e.target.value)}
                                optionType="button"
                                buttonStyle="solid"
                                style={{ width: '100%', display: 'flex' }}
                            >
                                <Radio.Button value="create" style={{ flex: 1, textAlign: 'center' }}>
                                    <PlusOutlined /> 新注册公司
                                </Radio.Button>
                                <Radio.Button value="join" style={{ flex: 1, textAlign: 'center' }}>
                                    <LoginOutlined /> 登录公司
                                </Radio.Button>
                            </Radio.Group>
                        </Form.Item>
                    )}

                    <Form.Item
                        name="company_name"
                        rules={[
                            { required: true, message: '请输入公司名称' },
                            { max: 200, message: '公司名称不能超过200个字符' },
                        ]}
                    >
                        <Input
                            prefix={<ShopOutlined />}
                            placeholder={mode === 'create' ? '输入新公司全称' : '输入公司全称'}
                            autoFocus
                        />
                    </Form.Item>

                    <Form.Item
                        name="company_password"
                        rules={[
                            { required: true, message: '请输入公司数据库密码' },
                            { min: 4, message: '公司数据库密码至少4位' },
                            { max: 128, message: '公司数据库密码不能超过128个字符' },
                        ]}
                    >
                        <Input.Password
                            prefix={<SafetyOutlined />}
                            placeholder={mode === 'create'
                                ? '设置新公司的数据库密码'
                                : '公司数据库密码（由公司管理员提供）'}
                        />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 12 }}>
                        <Button type="primary" htmlType="submit" loading={loading} block>
                            {mode === 'create' ? '创建公司并进入系统' : '加入公司并进入系统'}
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );
};

export default CompleteProfile;
