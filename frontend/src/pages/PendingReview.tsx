import React, { useEffect, useState, useCallback } from 'react';
import {
    Table, Button, Space, Tag, Modal, Input, message,
    Typography, Select, Tooltip,
} from 'antd';
import {
    CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { pendingApi } from '../api/pending';
import type { PendingScriptItem } from '../types';
import PageHeader from '../components/PageHeader';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const actionLabelMap: Record<string, { label: string; color: string }> = {
    create: { label: '新增', color: 'green' },
    update: { label: '修改', color: 'orange' },
};

const statusLabelMap: Record<string, { label: string; color: string }> = {
    pending: { label: '待审核', color: 'processing' },
    approved: { label: '已通过', color: 'success' },
    rejected: { label: '已驳回', color: 'error' },
};

const PendingReview: React.FC = () => {
    const [data, setData] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [statusFilter, setStatusFilter] = useState<string | undefined>('pending');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await pendingApi.list({
                page, page_size: pageSize,
                status: statusFilter,
            });
            const d = res.data.data;
            setData(d.items);
            setTotal(d.total);
        } catch { /* handled */ }
        finally { setLoading(false); }
    }, [page, pageSize, statusFilter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleApprove = async (id: number) => {
        try {
            await pendingApi.approve(id);
            message.success('审核通过，话术已入库');
            fetchData();
        } catch { /* handled */ }
    };

    const handleReject = (id: number) => {
        let reason = '';
        Modal.confirm({
            title: '驳回审核',
            content: (
                <div style={{ marginTop: 16 }}>
                    <Text type="secondary">请填写驳回原因：</Text>
                    <TextArea
                        rows={3}
                        placeholder="请输入驳回原因（必填）"
                        onChange={(e) => { reason = e.target.value; }}
                        style={{ marginTop: 8 }}
                    />
                </div>
            ),
            onOk: async () => {
                if (!reason.trim()) {
                    message.error('请填写驳回原因');
                    throw new Error('驳回原因不能为空');
                }
                try {
                    await pendingApi.reject(id, { reason: reason.trim() });
                    message.success('已驳回');
                    fetchData();
                } catch { /* handled */ }
            },
            okText: '确认驳回',
            cancelText: '取消',
            okButtonProps: { danger: true },
        });
    };

    const columns: ColumnsType<any> = [
        {
            title: '话术内容', dataIndex: 'content', width: 350,
            render: (text: string) => (
                <Tooltip title={text}>
                    <Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, maxWidth: 330 }}>
                        {text}
                    </Paragraph>
                </Tooltip>
            ),
        },
        {
            title: '操作类型', dataIndex: 'action', width: 80,
            render: (action: string) => {
                const info = actionLabelMap[action] || { label: action, color: 'default' };
                return <Tag color={info.color}>{info.label}</Tag>;
            },
        },
        {
            title: '所属分类', dataIndex: 'category_name', width: 100,
            render: (v: string | null) => v ? <Tag>{v}</Tag> : <Text type="secondary">-</Text>,
        },
        {
            title: '提交人', dataIndex: 'submitter_name', width: 100,
        },
        {
            title: '公司', dataIndex: 'company_name', width: 150,
            ellipsis: true,
            render: (v: string | null) => v || <Text type="secondary">-</Text>,
        },
        {
            title: '提交时间', dataIndex: 'created_at', width: 160,
            render: (v: string | null) => v ? new Date(v).toLocaleString('zh-CN') : '-',
        },
        {
            title: '状态', dataIndex: 'status', width: 80,
            render: (status: string) => {
                const info = statusLabelMap[status] || { label: status, color: 'default' };
                return <Tag color={info.color}>{info.label}</Tag>;
            },
        },
        {
            title: '驳回原因', dataIndex: 'review_reason', width: 150,
            render: (v: string | null) => v || <Text type="secondary">-</Text>,
        },
        {
            title: '审核人', dataIndex: 'reviewer_name', width: 80,
            render: (v: string | null) => v || <Text type="secondary">-</Text>,
        },
        {
            title: '操作', key: 'action', width: 140, fixed: 'right',
            render: (_: any, record: any) => {
                if (record.status !== 'pending') return <Text type="secondary">已处理</Text>;
                return (
                    <Space size={4}>
                        <Button type="link" size="small"
                            icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                            onClick={() => handleApprove(record.id)}>
                            通过
                        </Button>
                        <Button type="link" size="small" danger
                            icon={<CloseCircleOutlined />}
                            onClick={() => handleReject(record.id)}>
                            驳回
                        </Button>
                    </Space>
                );
            },
        },
    ];

    return (
        <div>
            <PageHeader title="审核管理" lead="审核用户提交的话术新增与修改申请" />
            <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Select
                    placeholder="按状态筛选"
                    value={statusFilter}
                    onChange={v => { setStatusFilter(v); setPage(1); }}
                    allowClear
                    style={{ width: 140 }}
                    options={[
                        { label: '待审核', value: 'pending' },
                        { label: '已通过', value: 'approved' },
                        { label: '已驳回', value: 'rejected' },
                    ]}
                />
                <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
                <Text type="secondary">
                    {statusFilter === 'pending' ? `待审核：${total} 条` : `共 ${total} 条`}
                </Text>
            </div>
            <Table
                rowKey="id"
                columns={columns}
                dataSource={data}
                loading={loading}
                scroll={{ x: 1400 }}
                pagination={{
                    current: page, pageSize, total,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                }}
            />
        </div>
    );
};

export default PendingReview;
