import React, { useEffect, useState } from 'react';
import {
    Table, Button, Space, Modal, Form, Input, InputNumber, Popconfirm,
    message, Tag, Typography,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import { categoryApi } from '../api/categories';
import { useAuth } from '../context/AuthContext';
import type { CategoryNode } from '../types';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;

interface FlatRow {
    key: string;
    id: number;
    name: string;
    parent_id: number | null;
    parent_name: string;
    sort_order: number;
    script_count: number;
    is_active: boolean;
    level: number;
}

const CategoryManage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const isUser = currentUser?.role === 'user';

    const [data, setData] = useState<FlatRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCat, setEditingCat] = useState<FlatRow | null>(null);
    const [form] = Form.useForm();

    const flattenTree = (tree: CategoryNode[], parentName = '', level = 0): FlatRow[] => {
        const result: FlatRow[] = [];
        for (const node of tree) {
            result.push({
                key: `cat-${node.id}`,
                id: node.id,
                name: node.name,
                parent_id: node.parent_id,
                parent_name: parentName,
                sort_order: node.sort_order,
                script_count: node.script_count,
                is_active: node.is_active,
                level,
            });
            if (node.children.length > 0) {
                result.push(...flattenTree(node.children, node.name, level + 1));
            }
        }
        return result;
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await categoryApi.getTree();
            setData(flattenTree(res.data.data || []));
        } catch {
            // handled
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleAddParent = () => {
        setEditingCat(null);
        form.resetFields();
        form.setFieldsValue({ parent_id: null, sort_order: 0 });
        setModalOpen(true);
    };

    const handleAddChild = (parentId: number) => {
        setEditingCat(null);
        form.resetFields();
        form.setFieldsValue({ parent_id: parentId, sort_order: 0 });
        setModalOpen(true);
    };

    const handleEdit = (record: FlatRow) => {
        setEditingCat(record);
        form.setFieldsValue({
            name: record.name,
            sort_order: record.sort_order,
        });
        setModalOpen(true);
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        if (editingCat) {
            await categoryApi.update(editingCat.id, {
                name: values.name,
                sort_order: values.sort_order,
            });
            message.success('更新成功');
        } else {
            await categoryApi.create({
                name: values.name,
                parent_id: values.parent_id,
                sort_order: values.sort_order,
            });
            message.success('添加成功');
        }
        setModalOpen(false);
        fetchData();
    };

    const handleDelete = async (id: number) => {
        try {
            await categoryApi.delete(id);
            message.success('删除成功');
            fetchData();
        } catch (err: any) {
            message.error(err?.response?.data?.detail || '删除失败，可能存在关联数据');
        }
    };

    const columns = [
        {
            title: '分类名称',
            dataIndex: 'name',
            key: 'name',
            render: (text: string, record: FlatRow) => (
                <Space>
                    <Text strong={record.level === 0} style={{
                        paddingLeft: record.level * 24,
                    }}>
                        {record.level > 0 ? '└ ' : ''}{text}
                    </Text>
                    {record.level === 0 && (
                        <Tag color="blue">一级</Tag>
                    )}
                    {record.level === 1 && (
                        <Tag color="green">二级</Tag>
                    )}
                </Space>
            ),
        },
        {
            title: '所属上级',
            dataIndex: 'parent_name',
            key: 'parent_name',
            width: 150,
            render: (text: string) => text || <Text type="secondary">- 顶级分类</Text>,
        },
        {
            title: '话术数量',
            dataIndex: 'script_count',
            key: 'script_count',
            width: 100,
            align: 'center' as const,
        },
        {
            title: '排序',
            dataIndex: 'sort_order',
            key: 'sort_order',
            width: 80,
            align: 'center' as const,
        },
        {
            title: '状态',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 70,
            render: (v: boolean) => v ? <Tag color="success">启用</Tag> : <Tag>禁用</Tag>,
        },
        {
            title: '操作',
            key: 'action',
            width: 200,
            render: (_: any, record: FlatRow) => (
                isUser ? <Text type="secondary">-</Text> : (
                    <Space size={4}>
                        {record.level === 0 && (
                            <Button type="link" size="small" icon={<PlusOutlined />}
                                onClick={() => handleAddChild(record.id)}>
                                添加子分类
                            </Button>
                        )}
                        <Button type="link" size="small" icon={<EditOutlined />}
                            onClick={() => handleEdit(record)}>
                            编辑
                        </Button>
                        <Popconfirm
                            title="确定删除此分类？"
                            onConfirm={() => handleDelete(record.id)}
                            icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                        >
                            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                        </Popconfirm>
                    </Space>
                )
            ),
        },
    ];

    return (
        <div>
            <PageHeader title="分类管理" lead="维护话术分类体系，支持一级/二级分类" />
            <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                {!isUser && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAddParent}>
                        添加一级分类
                    </Button>
                )}
                <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            </div>

            <Table
                rowKey="key"
                columns={columns}
                dataSource={data}
                loading={loading}
                pagination={false}
            />

            <Modal
                title={editingCat ? '编辑分类' : '添加分类'}
                open={modalOpen}
                onOk={handleSave}
                onCancel={() => setModalOpen(false)}
                okText="保存"
                cancelText="取消"
            >
                <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item name="parent_id" hidden>
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="name"
                        label="分类名称"
                        rules={[{ required: true, message: '请输入分类名称' }]}
                    >
                        <Input placeholder="如：产品质量问题" />
                    </Form.Item>
                    <Form.Item name="sort_order" label="排序序号">
                        <InputNumber min={0} style={{ width: '100%' }} placeholder="数字越小越靠前" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CategoryManage;
