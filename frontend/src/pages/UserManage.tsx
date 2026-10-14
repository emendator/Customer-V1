import React, { useEffect, useState, useCallback } from 'react';
import {
    Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker,
    message, Popconfirm, Typography, Tabs, Tooltip, Badge,
} from 'antd';
import {
    PlusOutlined, DeleteOutlined, ReloadOutlined,
    ExclamationCircleOutlined, CopyOutlined, DeleteRowOutlined, SafetyOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { userApi, type RecycleBinItem } from '../api/users';
import { useAuth } from '../context/AuthContext';
import type { UserListItem, InvitationCodeItem } from '../types';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;

const roleLabelMap: Record<string, { label: string; color: string }> = {
    super_admin: { label: '最高管理员', color: 'gold' },
    admin: { label: '管理员', color: 'blue' },
    user: { label: '用户', color: 'default' },
};

const UserManage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('users');

    return (
        <div>
            <PageHeader title="用户管理" lead="管理账号、邀请码与回收站" />
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
                { key: 'users', label: '账号管理' },
                { key: 'codes', label: '邀请码管理' },
                { key: 'recycle', label: <span><DeleteRowOutlined /> 回收站</span> },
            ]} />
            {activeTab === 'users' && <UserTable currentUser={currentUser} />}
            {activeTab === 'codes' && <InvitationCodeTable currentUser={currentUser} />}
            {activeTab === 'recycle' && <RecycleBinTable currentUser={currentUser} />}
        </div>
    );
};

// ==================== 账号管理表格 ====================
const UserTable: React.FC<{ currentUser: any }> = ({ currentUser }) => {
    const [data, setData] = useState<UserListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined);
    const [keyword, setKeyword] = useState('');
    const [cpModalOpen, setCpModalOpen] = useState(false);
    const [cpForm] = Form.useForm();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await userApi.list({
                page, page_size: pageSize,
                role: roleFilter,
                keyword: keyword || undefined,
            });
            const d = res.data.data;
            setData(d.items);
            setTotal(d.total);
        } catch { /* handled */ }
        finally { setLoading(false); }
    }, [page, pageSize, roleFilter, keyword]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleDelete = async (record: UserListItem) => {
        try {
            const res = await userApi.delete(record.id);
            message.success(res.data.message || '删除成功');
            fetchData();
        } catch { /* handled */ }
    };

    const handleSetExpiry = async (record: UserListItem, dateStr: string | null) => {
        try {
            await userApi.updateExpiry(record.id, { expires_at: dateStr });
            message.success('过期时间已更新');
            fetchData();
        } catch { /* handled */ }
    };

    // 打开「延长有效时间」弹窗（仅对已过期账户操作）
    const openExpiryModal = (record: UserListItem, defaultValue?: string) => {
        let inputValue = defaultValue || '';
        Modal.confirm({
            title: '延长有效时间',
            content: (
                <DatePicker
                    showTime
                    defaultValue={defaultValue ? dayjs(defaultValue) : undefined}
                    onChange={(date) => {
                        inputValue = date ? date.toISOString() : '';
                    }}
                    style={{ width: '100%', marginTop: 8 }}
                />
            ),
            onOk: () => handleSetExpiry(record, inputValue || null),
            okText: '确认',
            cancelText: '取消',
        });
    };

    const handleCompanyPassword = async () => {
        const values = await cpForm.validateFields();
        try {
            const res = await userApi.updateCompanyPassword({
                company_password: values.company_password,
            });
            message.success(res.data.message || '公司数据库密码已更新');
            setCpModalOpen(false);
            cpForm.resetFields();
        } catch { /* handled */ }
    };

    const columns: ColumnsType<UserListItem> = [
        {
            title: '用户名', dataIndex: 'username', width: 120,
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: '角色', dataIndex: 'role', width: 110,
            render: (role: string) => {
                const info = roleLabelMap[role] || { label: role, color: 'default' };
                return <Tag color={info.color}>{info.label}</Tag>;
            },
        },
        {
            title: '公司', dataIndex: 'company_name', width: 180,
            ellipsis: true,
            render: (v: string | null) => v || <Text type="secondary">-</Text>,
        },
        {
            title: '邮箱', dataIndex: 'email', width: 160,
            render: (v: string | null) => v || <Text type="secondary">-</Text>,
        },
        {
            title: '注册时间', dataIndex: 'created_at', width: 160,
            render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-',
        },
        {
            title: '最后登录', dataIndex: 'last_login_at', width: 160,
            render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '从未登录',
        },
        {
            title: '过期时间', dataIndex: 'expires_at', width: 160,
            render: (v: string | null, record: UserListItem) => {
                const now = new Date();
                const expired = !!v && new Date(v) < now;
                const canEdit = !v || expired; // 永不过期或已过期的可修改
                const expiryDisplay = (
                    <Space size={4}>
                        <Text type={expired ? 'danger' : undefined} delete={expired}>
                            {v ? new Date(v).toLocaleString('zh-CN') : '永不过期'}
                        </Text>
                        {expired && <Tag color="red">已过期</Tag>}
                        {!canEdit && <Tag color="blue">有效期</Tag>}
                    </Space>
                );
                return canEdit ? (
                    <Space
                        size={4}
                        style={{ cursor: 'pointer' }}
                        onClick={() => openExpiryModal(record, v || undefined)}
                    >
                        {expiryDisplay}
                    </Space>
                ) : (
                    <Tooltip title="账号在有效期内，不可修改过期时间，请等待过期后再操作">
                        {expiryDisplay}
                    </Tooltip>
                );
            },
        },
        {
            title: '状态', dataIndex: 'is_active', width: 70,
            render: (v: boolean) => v ? <Tag color="success">正常</Tag> : <Tag color="error">已禁用</Tag>,
        },
        {
            title: '操作', key: 'action', width: 140, fixed: 'right',
            render: (_, record) => {
                // 不能操作自己 / 最高级管理员；admin 不能操作其他管理员
                if (record.id === currentUser?.id || record.role === 'super_admin') return <Text type="secondary">-</Text>;
                if (currentUser?.role === 'admin' && record.role !== 'user') return <Text type="secondary">-</Text>;

                const now = new Date();
                const hasValidExpiry = record.expires_at && new Date(record.expires_at) > now;
                const neverExpires = !record.expires_at;
                const expired = record.expires_at && new Date(record.expires_at) < now;

                return (
                    <Space size={0}>
                        {/* 已过期账户：延长有效时间 */}
                        {expired && (
                            <Button type="link" size="small" icon={<ReloadOutlined />}
                                onClick={() => openExpiryModal(record, record.expires_at || undefined)}>
                                延长
                            </Button>
                        )}
                        {/* 清除（未过期/永不过期禁用） */}
                        {hasValidExpiry || neverExpires ? (
                            <Tooltip title={hasValidExpiry
                                ? '账号在有效期内，不可删除，请等待过期后再操作'
                                : '该账号永不过期，不可删除'}>
                                <Button type="link" size="small" disabled icon={<DeleteOutlined />}>清除</Button>
                            </Tooltip>
                        ) : (
                            <Popconfirm
                                title={record.role === 'admin'
                                    ? '确定删除此管理员？其下属所有用户账号将被同步清除！'
                                    : '确定清除此账号？'}
                                onConfirm={() => handleDelete(record)}
                                icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                                okText="确认清除"
                                cancelText="取消"
                            >
                                <Button type="link" size="small" danger icon={<DeleteOutlined />}>清除</Button>
                            </Popconfirm>
                        )}
                    </Space>
                );
            },
        },
    ];

    return (
        <div>
            <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Input.Search
                    placeholder="搜索用户名、邮箱或公司"
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    onSearch={() => { setPage(1); fetchData(); }}
                    style={{ width: 280 }}
                    allowClear
                />
                <Select
                    placeholder="按角色筛选"
                    value={roleFilter}
                    onChange={v => { setRoleFilter(v); setPage(1); }}
                    allowClear
                    style={{ width: 140 }}
                    options={[
                        { label: '最高管理员', value: 'super_admin' },
                        { label: '管理员', value: 'admin' },
                        { label: '用户', value: 'user' },
                    ]}
                />
                <Button icon={<SafetyOutlined />} onClick={() => { cpForm.resetFields(); setCpModalOpen(true); }}>
                    公司数据库密码
                </Button>
                <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            </div>
            <Table
                rowKey="id"
                columns={columns}
                dataSource={data}
                loading={loading}
                scroll={{ x: 1200 }}
                pagination={{
                    current: page, pageSize, total,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                }}
            />

            <Modal
                title="公司数据库密码管理"
                open={cpModalOpen}
                onCancel={() => setCpModalOpen(false)}
                footer={null}
                width={460}
            >
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                    仅能修改当前账号所属公司的数据库密码（公司级数据隔离凭据），修改后该公司所有账号同步生效。
                </Text>
                <Form form={cpForm} layout="vertical">
                    <Form.Item label="所属公司名称">
                        <Input value={currentUser?.company_name || ''} disabled />
                    </Form.Item>
                    <Form.Item name="company_password" label="新的公司数据库密码"
                        rules={[
                            { required: true, message: '请输入新的公司数据库密码' },
                            { min: 4, message: '公司数据库密码至少4位' },
                            { max: 128, message: '公司数据库密码不能超过128个字符' },
                        ]}>
                        <Input.Password placeholder="输入新的公司数据库密码" />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                        <Button type="primary" onClick={handleCompanyPassword} block>
                            更新密码
                        </Button>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

// ==================== 邀请码管理表格 ====================
const InvitationCodeTable: React.FC<{ currentUser: any }> = ({ currentUser }) => {
    const [data, setData] = useState<InvitationCodeItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [generateModalOpen, setGenerateModalOpen] = useState(false);
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [form] = Form.useForm();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await userApi.getInvitationCodes({ page, page_size: pageSize });
            const d = res.data.data;
            setData(d.items);
            setTotal(d.total);
        } catch { /* handled */ }
        finally { setLoading(false); }
    }, [page, pageSize]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleGenerate = async () => {
        const values = await form.validateFields();
        try {
            const res = await userApi.generateInvitationCode({
                level: values.level,
                expires_at: values.expires_at.toISOString(),
            });
            const code = res.data.data.code;
            setGeneratedCode(code);
            message.success('邀请码生成成功！');
            form.resetFields();
            fetchData();
        } catch { /* handled */ }
    };

    const handleDeactivate = async (id: number) => {
        try {
            await userApi.deactivateCode(id);
            message.success('邀请码已删除（已移入回收站，可查看）');
            fetchData();
        } catch { /* handled */ }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            message.success('已复制到剪贴板');
        });
    };

    const columns: ColumnsType<InvitationCodeItem> = [
        {
            title: '邀请码', dataIndex: 'code', width: 130,
            render: (code: string) => (
                <Space>
                    <Text code strong>{code}</Text>
                    <Tooltip title="复制">
                        <Button type="link" size="small" icon={<CopyOutlined />}
                            onClick={() => copyToClipboard(code)} />
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: '角色', dataIndex: 'level', width: 100,
            render: (level: number) => (
                <Tag color={level === 1 ? 'volcano' : 'cyan'}>
                    {level === 1 ? '管理员' : '用户'}
                </Tag>
            ),
        },
        {
            title: '关联公司', dataIndex: 'company_name', width: 180,
            ellipsis: true,
            render: (v: string | null) => v || <Text type="secondary">-</Text>,
        },
        {
            title: '创建者', dataIndex: 'creator_name', width: 100,
        },
        {
            title: '创建时间', dataIndex: 'created_at', width: 160,
            render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-',
        },
        {
            title: '过期时间', dataIndex: 'expires_at', width: 160,
            render: (v: string | null) => {
                if (!v) return <Text type="secondary">-</Text>;
                const expired = new Date(v) < new Date();
                return <Text type={expired ? 'danger' : undefined}>{new Date(v).toLocaleString('zh-CN')}</Text>;
            },
        },
        {
            title: '状态', dataIndex: 'is_active', width: 80,
            render: (active: boolean, record: InvitationCodeItem) => {
                if (record.used_at) return <Tag color="default">已使用</Tag>;
                if (!active) return <Tag color="error">已作废</Tag>;
                if (record.expires_at && new Date(record.expires_at) < new Date()) return <Tag color="warning">已过期</Tag>;
                return <Tag color="success">有效</Tag>;
            },
        },
        {
            title: '使用人', dataIndex: 'used_by_name', width: 100,
            render: (name: string | null) => name ? <Text>{name}</Text> : <Text type="secondary">-</Text>,
        },
        {
            title: '操作', key: 'action', width: 90,
            render: (_, record) => (
                <Popconfirm title="确定删除此邀请码？（将移入回收站）" onConfirm={() => handleDeactivate(record.id)}>
                    <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>
            ),
        },
    ];

    return (
        <div>
            <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    setGeneratedCode(null);
                    form.resetFields();
                    setGenerateModalOpen(true);
                }}>
                    生成邀请码
                </Button>
                <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            </div>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={data}
                loading={loading}
                scroll={{ x: 1100 }}
                pagination={{
                    current: page, pageSize, total,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                }}
            />

            <Modal
                title="生成邀请码"
                open={generateModalOpen}
                onCancel={() => setGenerateModalOpen(false)}
                footer={null}
                width={480}
            >
                {generatedCode ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <Text type="secondary">邀请码已生成：</Text>
                        <div style={{ fontSize: 28, fontWeight: 'bold', margin: '16px 0', letterSpacing: 4 }}>
                            {generatedCode}
                        </div>
                        <Space>
                            <Button type="primary" icon={<CopyOutlined />}
                                onClick={() => copyToClipboard(generatedCode)}>
                                复制邀请码
                            </Button>
                            <Button onClick={() => {
                                setGeneratedCode(null);
                                form.resetFields();
                            }}>
                                继续生成
                            </Button>
                            <Button onClick={() => setGenerateModalOpen(false)}>
                                关闭
                            </Button>
                        </Space>
                    </div>
                ) : (
                    <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                        <Form.Item name="level" label="账号角色"
                            rules={[{ required: true, message: '请选择角色' }]}>
                            <Select
                                options={[
                                    ...(currentUser?.role === 'super_admin'
                                        ? [{ label: '管理员', value: 1 }]
                                        : []),
                                    { label: '用户', value: 2 },
                                ]}
                                placeholder="请选择角色"
                            />
                        </Form.Item>
                        <Form.Item name="expires_at" label="过期时间"
                            rules={[{ required: true, message: '请选择过期时间' }]}>
                            <DatePicker
                                showTime
                                style={{ width: '100%' }}
                                placeholder="选择过期时间"
                            />
                        </Form.Item>
                        <Form.Item>
                            <Button type="primary" onClick={handleGenerate} block>
                                生成
                            </Button>
                        </Form.Item>
                    </Form>
                )}
            </Modal>
        </div>
    );
};

// ==================== 回收站 ====================
const RecycleBinTable: React.FC<{ currentUser: any }> = ({ currentUser }) => {
    const [recycleTab, setRecycleTab] = useState('users');

    return (
        <div>
            <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Popconfirm
                    title="确定清空回收站？"
                    description="已清除的账号和已删除的邀请码将被永久删除，不可恢复！"
                    onConfirm={async () => {
                        try {
                            const res = await userApi.clearRecycleBin();
                            message.success(res.data.message || '回收站已清空');
                        } catch { /* handled */ }
                    }}
                    okText="确认清空"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                >
                    <Button danger icon={<DeleteOutlined />}>清空回收站</Button>
                </Popconfirm>
                <Text type="secondary">清空后数据将永久删除，不可恢复</Text>
                <div style={{ flex: 1 }} />
            </div>

            <Tabs activeKey={recycleTab} onChange={setRecycleTab} items={[
                { key: 'users', label: '已清除的账号' },
                { key: 'codes', label: '已删除的邀请码' },
            ]} />

            {recycleTab === 'users' && <RecycleUserTable />}
            {recycleTab === 'codes' && <RecycleCodeTable />}
        </div>
    );
};

// ==================== 已清除账号子表 ====================
const RecycleUserTable: React.FC = () => {
    const [data, setData] = useState<RecycleBinItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await userApi.getRecycleBin({ page, page_size: pageSize });
            const d = res.data.data;
            setData(d.items);
            setTotal(d.total);
        } catch { /* handled */ }
        finally { setLoading(false); }
    }, [page, pageSize]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const columns: ColumnsType<RecycleBinItem> = [
        {
            title: '用户名', dataIndex: 'username', width: 120,
            render: (text: string) => <Text delete style={{ color: 'var(--ink-faint)' }}>{text}</Text>
        },
        {
            title: '角色', dataIndex: 'role', width: 100,
            render: (role: string) => {
                const info = roleLabelMap[role] || { label: role, color: 'default' };
                return <Tag color={info.color}>{info.label}</Tag>;
            }
        },
        {
            title: '公司', dataIndex: 'company_name', width: 180, ellipsis: true,
            render: (v: string | null) => v || <Text type="secondary">-</Text>
        },
        {
            title: '注册时间', dataIndex: 'created_at', width: 150,
            render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-'
        },
        {
            title: '最后登录', dataIndex: 'last_login_at', width: 150,
            render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '从未登录'
        },
        {
            title: '清除时间', dataIndex: 'deleted_at', width: 150,
            render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-'
        },
        {
            title: '关联邀请码', dataIndex: 'invitation_code', width: 120,
            render: (code: string | null) => code
                ? <Tag color="error" style={{ fontFamily: 'monospace' }}>{code}</Tag>
                : <Text type="secondary">-</Text>
        },
        {
            title: '状态', dataIndex: 'is_active', width: 70,
            render: () => <Tag color="error">已清除</Tag>
        },
    ];

    return (
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
            scroll={{ x: 1000 }}
            pagination={{
                current: page, pageSize, total, showSizeChanger: true,
                showTotal: (t) => `共 ${t} 条已清除账号`,
                onChange: (p, ps) => { setPage(p); setPageSize(ps); }
            }}
            locale={{ emptyText: '暂无已清除的账号' }} />
    );
};

// ==================== 已删除邀请码子表 ====================
const RecycleCodeTable: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await userApi.getCodeRecycleBin({ page, page_size: pageSize });
            const d = res.data.data;
            setData(d.items);
            setTotal(d.total);
        } catch { /* handled */ }
        finally { setLoading(false); }
    }, [page, pageSize]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const columns: ColumnsType<any> = [
        {
            title: '邀请码', dataIndex: 'code', width: 120,
            render: (code: string) => <Text code delete style={{ color: 'var(--ink-faint)' }}>{code}</Text>
        },
        {
            title: '角色', dataIndex: 'level', width: 100,
            render: (level: number) => (
                <Tag color={level === 1 ? 'volcano' : 'cyan'}>{level === 1 ? '管理员' : '用户'}</Tag>
            )
        },
        { title: '创建者', dataIndex: 'creator_name', width: 100 },
        {
            title: '创建时间', dataIndex: 'created_at', width: 150,
            render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-'
        },
        {
            title: '删除时间', dataIndex: 'deleted_at', width: 150,
            render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-'
        },
        {
            title: '使用状态', dataIndex: 'used_at', width: 100,
            render: (v: string | null) => v ? <Tag color="default">已使用</Tag> : <Tag color="error">未使用已删除</Tag>
        },
        {
            title: '状态', dataIndex: 'is_active', width: 70,
            render: () => <Tag color="error">已删除</Tag>
        },
    ];

    return (
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading}
            scroll={{ x: 800 }}
            pagination={{
                current: page, pageSize, total, showSizeChanger: true,
                showTotal: (t) => `共 ${t} 条已删除邀请码`,
                onChange: (p, ps) => { setPage(p); setPageSize(ps); }
            }}
            locale={{ emptyText: '暂无已删除的邀请码' }} />
    );
};

export default UserManage;
