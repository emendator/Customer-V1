import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Typography, Avatar, Dropdown, Tag, Space, Button, Alert, Modal } from 'antd';
import {
    CustomerServiceOutlined,
    FileTextOutlined,
    TagOutlined,
    UserOutlined,
    LogoutOutlined,
    AuditOutlined,
    TeamOutlined,
    KeyOutlined,
    ExclamationCircleOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    SunOutlined,
    MoonOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const { Header, Sider, Content } = AntLayout;
const { Text } = Typography;

const roleLabelMap: Record<string, { label: string; color: string }> = {
    super_admin: { label: '最高管理员', color: 'gold' },
    admin: { label: '管理员', color: 'blue' },
    user: { label: '用户', color: 'default' },
    guest: { label: '游客', color: 'green' },
};

const AppLayout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const selectedKey = '/' + (location.pathname.split('/')[1] || 'workbench');

    const baseMenuItems = [
        { key: '/workbench', icon: <CustomerServiceOutlined />, label: '客服工作台' },
        { key: '/scripts', icon: <FileTextOutlined />, label: '话术库管理' },
    ];

    const adminMenuItems = [
        { key: '/categories', icon: <TagOutlined />, label: '分类管理' },
        { key: '/users', icon: <TeamOutlined />, label: '用户管理' },
        { key: '/pending', icon: <AuditOutlined />, label: '审核管理' },
    ];

    const guestMenuItems = [
        { key: '/categories', icon: <TagOutlined />, label: '分类管理' },
    ];

    const menuItems = user?.role === 'user'
        ? baseMenuItems
        : user?.role === 'guest'
            ? [...baseMenuItems, ...guestMenuItems]
            : [...baseMenuItems, ...adminMenuItems];

    const userDropdownItems = {
        items: [
            {
                key: 'role',
                label: `角色：${roleLabelMap[user?.role || 'user']?.label || '用户'}`,
                disabled: true,
            },
            {
                key: 'company',
                label: `公司：${user?.company_name || '未设置'}`,
                disabled: true,
            },
            {
                key: 'tokens',
                label: `Token消耗：${(user?.total_tokens_spent || 0).toLocaleString()}`,
                disabled: true,
            },
            { type: 'divider' as const },
            { key: 'api-key', icon: <KeyOutlined />, label: (<span>API Key 配置{!user?.has_api_key && <Tag color="error" style={{ marginLeft: 8, fontSize: 10 }}>未配置</Tag>}</span>), onClick: () => navigate('/api-key') },
            { type: 'divider' as const },
            {
                key: 'logout',
                icon: <LogoutOutlined />,
                label: '退出登录',
                onClick: () => {
                    if (user?.role === 'guest') {
                        Modal.confirm({
                            title: '确认退出游客模式？',
                            icon: <ExclamationCircleOutlined />,
                            content: '游客模式不会保留任何数据，退出后您导入的话术、分类及所有操作记录将被全部清除，无法恢复。',
                            okText: '退出并清除',
                            cancelText: '继续使用',
                            onOk: () => { logout(); navigate('/login'); },
                        });
                    } else {
                        logout();
                        navigate('/login');
                    }
                },
            },
        ],
    };

    const roleInfo = roleLabelMap[user?.role || 'user'] || { label: '用户', color: 'default' };
    const pageTitle = menuItems.find(item => item.key === selectedKey)?.label || '智能客服话术库系统';

    return (
        <AntLayout style={{ minHeight: '100vh' }}>
            <Sider
                collapsible
                collapsed={collapsed}
                trigger={null}
                width={248}
                theme="light"
                style={{ borderRight: '1px solid var(--line)', position: 'relative', boxShadow: 'var(--shadow-sm)' }}
            >
                <div className="app-brand">
                    <div className="brand-mark">💬</div>
                    {!collapsed && (
                        <div style={{ minWidth: 0 }}>
                            <div className="brand-name">智能客服</div>
                            <div className="brand-sub">话术库系统</div>
                        </div>
                    )}
                </div>
                <Menu
                    mode="inline"
                    selectedKeys={[selectedKey]}
                    items={menuItems}
                    onClick={({ key }) => navigate(key)}
                    style={{ borderRight: 0, marginTop: 8 }}
                />
                {!collapsed && (
                    <div className="sider-footer">
                        让每条回复都恰到好处
                        <br />· 本地匹配 · 大模型增强
                    </div>
                )}
            </Sider>
            <AntLayout>
                <Header className="app-header" style={{ backdropFilter: 'blur(12px)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                        <Button
                            type="text"
                            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            onClick={() => setCollapsed(c => !c)}
                            style={{ fontSize: 18 }}
                        />
                        <div className="header-page-title">{pageTitle}</div>
                    </div>
                    <Space size={4} align="center">
                        <Button
                            type="text"
                            icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />}
                            onClick={toggleTheme}
                            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
                            style={{ fontSize: 18, marginRight: 4 }}
                        />
                        <Dropdown menu={userDropdownItems} placement="bottomRight">
                            <Space className="user-pill">
                                <Avatar
                                    size="small"
                                    icon={<UserOutlined />}
                                    style={{ backgroundColor: roleInfo.color === 'gold' ? '#b9822e' : roleInfo.color === 'blue' ? '#4356c7' : roleInfo.color === 'green' ? '#3e8e63' : '#d3cec5' }}
                                />
                                <Text>{user?.username}</Text>
                                <Tag color={roleInfo.color} style={{ margin: 0 }}>{roleInfo.label}</Tag>
                            </Space>
                        </Dropdown>
                    </Space>
                </Header>
                <Content style={{ padding: '28px 32px 48px' }}>
                    {user?.role === 'guest' && (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 20, maxWidth: 1360, marginLeft: 'auto', marginRight: 'auto' }}
                            message="游客模式：不保留任何数据"
                            description="您当前以游客身份使用，导入的话术、分类操作等所有数据均为临时数据，退出登录后将全部自动清除，不会保留任何记录。"
                        />
                    )}
                    <div className="page-container">
                        <Outlet />
                    </div>
                </Content>
            </AntLayout>
        </AntLayout>
    );
};

export default AppLayout;
