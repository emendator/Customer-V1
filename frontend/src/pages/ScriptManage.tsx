import React, { useEffect, useState, useCallback } from 'react';
import {
    Table, Button, Space, Input, Select, Tag, Modal, Form, Popconfirm,
    message, Switch, Typography, TreeSelect, Cascader, Tooltip, Badge,
    Upload, Radio, Alert, Result,
} from 'antd';
import {
    PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined,
    ReloadOutlined, ExclamationCircleOutlined, AuditOutlined,
    ImportOutlined, DownloadOutlined, InboxOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { scriptApi } from '../api/scripts';
import { categoryApi } from '../api/categories';
import { pendingApi } from '../api/pending';
import { useAuth } from '../context/AuthContext';
import type { ScriptItem, CategoryNode, ExcelPreview, ImportResult } from '../types';
import { uploadApi } from '../api/upload';
import PageHeader from '../components/PageHeader';

const { Text } = Typography;

// 将分类树转为 Cascader 需要的格式
function toCascaderOptions(tree: CategoryNode[]): any[] {
    return tree.map(parent => ({
        label: parent.name,
        value: parent.id,
        children: parent.children.map(child => ({
            label: child.name,
            value: child.id,
        })),
    }));
}

const ScriptManage: React.FC = () => {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    const isUser = currentUser?.role === 'user';
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';

    const [data, setData] = useState<ScriptItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [keyword, setKeyword] = useState('');
    const [filterCategory, setFilterCategory] = useState<number | null>(null);
    const [filterActive, setFilterActive] = useState<boolean | undefined>(undefined);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [pendingCount, setPendingCount] = useState(0);

    // 弹窗
    const [modalOpen, setModalOpen] = useState(false);
    const [editingScript, setEditingScript] = useState<ScriptItem | null>(null);
    const [form] = Form.useForm();

    // 导入导出
    const [importOpen, setImportOpen] = useState(false);
    const [importStep, setImportStep] = useState(0);
    const [importPreview, setImportPreview] = useState<ExcelPreview | null>(null);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [importStrategy, setImportStrategy] = useState('append');
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [importingId, setImportingId] = useState(false);

    // 分类选项
    const [categoryOptions, setCategoryOptions] = useState<any[]>([]);
    const [categories, setCategories] = useState<CategoryNode[]>([]);

    useEffect(() => {
        categoryApi.getTree().then(res => {
            const tree = res.data.data || [];
            setCategories(tree);
            setCategoryOptions(toCascaderOptions(tree));
        });
    }, []);

    // 管理员：获取待审核数量
    useEffect(() => {
        if (isAdmin) {
            pendingApi.list({ status: 'pending', page_size: 1 }).then(res => {
                setPendingCount(res.data.data?.total || 0);
            }).catch(() => { });
        }
    }, [isAdmin]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await scriptApi.list({
                keyword: keyword || undefined,
                category_id: filterCategory,
                is_active: filterActive,
                page,
                page_size: pageSize,
            });
            const d = res.data.data;
            setData(d.items);
            setTotal(d.total);
        } catch {
            // handled by interceptor
        } finally {
            setLoading(false);
        }
    }, [keyword, filterCategory, filterActive, page, pageSize]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSearch = () => {
        setPage(1);
        fetchData();
    };

    const handleAdd = () => {
        setEditingScript(null);
        form.resetFields();
        setModalOpen(true);
    };

    const handleEdit = (record: ScriptItem) => {
        setEditingScript(record);
        form.setFieldsValue({
            content: record.content,
            keywords: record.keywords,
            // 找分类路径
            categoryPath: record.category_id ? findCategoryPath(record.category_id) : undefined,
        });
        setModalOpen(true);
    };

    const findCategoryPath = (catId: number): number[] | undefined => {
        for (const p of categories) {
            if (p.id === catId) return [p.id];
            for (const c of p.children) {
                if (c.id === catId) return [p.id, c.id];
            }
        }
        return undefined;
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        const categoryPath = values.categoryPath;
        // 取最后一级作为 category_id
        const categoryId = categoryPath ? categoryPath[categoryPath.length - 1] : null;

        const payload = {
            content: values.content,
            keywords: values.keywords || '',
            category_id: categoryId,
        };

        if (editingScript) {
            const res = await scriptApi.update(editingScript.id, payload);
            message.success(res.data?.message || (isUser ? '修改申请已提交审核' : '更新成功'));
        } else {
            const res = await scriptApi.create(payload);
            message.success(res.data?.message || (isUser ? '添加申请已提交审核' : '添加成功'));
        }
        setModalOpen(false);
        fetchData();
    };

    const handleDelete = async (id: number) => {
        await scriptApi.delete(id);
        message.success('删除成功');
        fetchData();
    };

    const handleToggle = async (id: number) => {
        await scriptApi.toggle(id);
        fetchData();
    };

    const handleBatchDelete = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('请先选择要删除的话术');
            return;
        }
        await scriptApi.batchDelete(selectedRowKeys as number[]);
        message.success(`成功删除 ${selectedRowKeys.length} 条`);
        setSelectedRowKeys([]);
        fetchData();
    };

    // ====== 导入导出 ======

    const handleDownloadTemplate = async () => {
        try {
            const res = await uploadApi.downloadTemplate();
            const blob = new Blob([res.data]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '话术导入模板.xlsx';
            a.click();
            URL.revokeObjectURL(url);
            message.success('模板下载成功');
        } catch { message.error('下载失败'); }
    };

    const handleExport = async () => {
        try {
            setImportingId(true);
            const res = await uploadApi.exportScripts();
            const blob = new Blob([res.data]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '话术库导出.xlsx';
            a.click();
            URL.revokeObjectURL(url);
            message.success('导出成功');
        } catch { message.error('导出失败'); }
        finally { setImportingId(false); }
    };

    const handleImportUpload = async (file: File) => {
        try {
            const res = await uploadApi.uploadExcel(file);
            const data = res.data.data;
            setImportPreview(data);
            setImportStep(1);
            const autoMapping: Record<string, string> = {};
            for (const h of data.headers) {
                if (h.includes('话术') || h.includes('内容')) autoMapping.content = h;
                if (h.includes('关键词') || h.includes('标签')) autoMapping.keywords = h;
                if (h.includes('分类')) autoMapping.category_name = h;
            }
            setColumnMapping(autoMapping);
        } catch { message.error('文件解析失败'); }
    };

    const handleImportConfirm = async () => {
        if (!importPreview || !columnMapping.content) {
            message.warning('请至少映射"话术内容"列');
            return;
        }
        setImporting(true);
        try {
            const res = await uploadApi.importData({
                filename: importPreview.filename,
                column_mapping: columnMapping,
                strategy: importStrategy,
            });
            setImportResult(res.data.data);
            setImportStep(2);
            fetchData();
        } catch { /* handled */ }
        finally { setImporting(false); }
    };

    const handleImportReset = () => {
        setImportStep(0);
        setImportPreview(null);
        setColumnMapping({});
        setImportResult(null);
    };

    const columns: ColumnsType<ScriptItem> = [
        {
            title: 'ID',
            dataIndex: 'id',
            width: 60,
        },
        {
            title: '话术内容',
            dataIndex: 'content',
            width: 350,
            ellipsis: true,
            render: (text: string) => (
                <Tooltip title={text}>
                    <Text ellipsis style={{ maxWidth: 330 }}>{text}</Text>
                </Tooltip>
            ),
        },
        {
            title: '分类',
            dataIndex: 'category_name',
            width: 140,
            filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => {
                const options = Array.from(new Set(
                    data.map(r => r.parent_category_name
                        ? `${r.parent_category_name} / ${r.category_name}`
                        : r.category_name || '(空白)')
                )).sort();
                const hasBlank = data.some(r => !r.category_name);
                if (hasBlank && !options.includes('(空白)')) options.unshift('(空白)');
                return (
                    <div style={{ padding: 8 }}>
                        <Input
                            placeholder="搜索分类"
                            value={selectedKeys[0] as string || ''}
                            onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                            style={{ marginBottom: 8, display: 'block' }}
                        />
                        <div style={{ maxHeight: 200, overflow: 'auto', borderTop: '1px solid var(--line)' }}>
                            {options.filter(opt => !selectedKeys[0] || opt.includes(selectedKeys[0] as string)).map(opt => (
                                <div
                                    key={opt}
                                    onClick={() => {
                                        setSelectedKeys([opt]);
                                        confirm();
                                    }}
                                    style={{
                                        padding: '4px 8px', cursor: 'pointer', borderRadius: 4,
                                        background: selectedKeys[0] === opt ? 'var(--accent-soft)' : undefined,
                                    }}
                                    onMouseEnter={e => { if (selectedKeys[0] !== opt) (e.target as HTMLElement).style.background = 'var(--bg-tint)'; }}
                                    onMouseLeave={e => { if (selectedKeys[0] !== opt) (e.target as HTMLElement).style.background = 'transparent'; }}
                                >
                                    <Text style={{ fontSize: 13 }}>{opt === '(空白)' ? <Text type="secondary" italic>(空白)</Text> : opt}</Text>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                            <Button size="small" onClick={() => { clearFilters?.(); confirm(); }}>重置</Button>
                            <Button size="small" type="primary" onClick={() => confirm()}>确定</Button>
                        </div>
                    </div>
                );
            },
            onFilter: (value, record) => {
                if (value === '(空白)') return !record.category_name;
                const full = record.parent_category_name
                    ? `${record.parent_category_name} / ${record.category_name}`
                    : record.category_name || '(空白)';
                return full === value;
            },
            render: (name: string | null, record: ScriptItem) => {
                if (!name) return <Tag>未分类</Tag>;
                const full = record.parent_category_name
                    ? `${record.parent_category_name} / ${name}`
                    : name;
                return <Tag color="blue">{full}</Tag>;
            },
        },
        {
            title: '关键词',
            dataIndex: 'keywords',
            width: 150,
            ellipsis: true,
            render: (text: string) => text ? (
                <Space size={4} wrap>
                    {text.split(',').filter(Boolean).map((kw, i) => (
                        <Tag key={i} color="geekblue">{kw.trim()}</Tag>
                    ))}
                </Space>
            ) : <Text type="secondary">-</Text>,
        },
        {
            title: '使用次数',
            dataIndex: 'usage_count',
            width: 80,
            sorter: (a, b) => a.usage_count - b.usage_count,
        },
        {
            title: '来源',
            dataIndex: 'source',
            width: 100,
            filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => {
                const sourceMap = { manual: '手动', ai: 'AI', excel: '导入' };
                return (
                    <div style={{ padding: 8 }}>
                        {Object.entries(sourceMap).map(([val, label]) => (
                            <div
                                key={val}
                                onClick={() => {
                                    const newKeys = selectedKeys.includes(val)
                                        ? (selectedKeys as string[]).filter(k => k !== val)
                                        : [...(selectedKeys as string[] || []), val];
                                    setSelectedKeys(newKeys);
                                }}
                                style={{
                                    padding: '4px 8px', cursor: 'pointer', borderRadius: 4,
                                    background: selectedKeys.includes(val) ? 'var(--accent-soft)' : undefined,
                                }}
                            >
                                <input type="checkbox" checked={selectedKeys.includes(val)} readOnly style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 13 }}>{label}</Text>
                            </div>
                        ))}
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                            <Button size="small" onClick={() => { clearFilters?.(); confirm(); }}>重置</Button>
                            <Button size="small" type="primary" onClick={() => confirm()}>确定</Button>
                        </div>
                    </div>
                );
            },
            onFilter: (value, record) => record.source === value,
            render: (s: string) => {
                const map: Record<string, { color: string; label: string }> = {
                    manual: { color: 'green', label: '手动' },
                    ai: { color: 'blue', label: 'AI' },
                    excel: { color: 'orange', label: '导入' },
                };
                const cfg = map[s] || { color: 'default', label: s };
                return <Tag color={cfg.color}>{cfg.label}</Tag>;
            },
        },
        {
            title: '状态',
            dataIndex: 'is_active',
            width: 80,
            filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => {
                const options = [
                    { val: true, label: '启用' },
                    { val: false, label: '禁用' },
                ];
                return (
                    <div style={{ padding: 8 }}>
                        {options.map(({ val, label }) => {
                            const strVal = String(val);
                            return (
                                <div
                                    key={strVal}
                                    onClick={() => {
                                        const newKeys = selectedKeys.includes(strVal)
                                            ? (selectedKeys as string[]).filter(k => k !== strVal)
                                            : [...(selectedKeys as string[] || []), strVal];
                                        setSelectedKeys(newKeys);
                                    }}
                                    style={{
                                        padding: '4px 8px', cursor: 'pointer', borderRadius: 4,
                                        background: selectedKeys.includes(strVal) ? 'var(--accent-soft)' : undefined,
                                    }}
                                >
                                    <input type="checkbox" checked={selectedKeys.includes(strVal)} readOnly style={{ marginRight: 8 }} />
                                    <Text style={{ fontSize: 13 }}>{label}</Text>
                                </div>
                            );
                        })}
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                            <Button size="small" onClick={() => { clearFilters?.(); confirm(); }}>重置</Button>
                            <Button size="small" type="primary" onClick={() => confirm()}>确定</Button>
                        </div>
                    </div>
                );
            },
            onFilter: (value, record) => String(record.is_active) === value,
            render: (v: boolean, record: ScriptItem) => (
                <Switch
                    size="small"
                    checked={v}
                    onChange={() => handleToggle(record.id)}
                />
            ),
        },
        {
            title: '更新时间',
            dataIndex: 'updated_at',
            width: 160,
            render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-',
        },
        {
            title: '操作',
            key: 'action',
            width: 140,
            fixed: 'right',
            render: (_, record) => (
                <Space size={4}>
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
                        {isUser ? '申请修改' : '编辑'}
                    </Button>
                    {!isUser && (
                        <Popconfirm
                            title="确定删除此条话术？"
                            onConfirm={() => handleDelete(record.id)}
                            icon={<ExclamationCircleOutlined style={{ color: 'red' }} />}
                        >
                            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                                删除
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <PageHeader title="话术库管理" lead="统一维护客服话术，支持分类、导入导出与审核" />
            {/* 搜索栏 */}
            <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Input.Search
                    placeholder="搜索话术内容或关键词"
                    value={keyword}
                    onChange={e => setKeyword(e.target.value)}
                    onSearch={handleSearch}
                    style={{ width: 280 }}
                    allowClear
                />
                <TreeSelect
                    placeholder="按分类筛选（支持大类/细分）"
                    value={filterCategory}
                    onChange={v => { setFilterCategory(v); setPage(1); }}
                    allowClear
                    style={{ width: 200 }}
                    treeData={categories.map(p => {
                        const hasChildren = p.children && p.children.length > 0;
                        return {
                            title: hasChildren ? `${p.name}（全部）` : p.name,
                            value: p.id,
                            children: hasChildren
                                ? p.children.map(c => ({ title: c.name, value: c.id }))
                                : undefined,
                        };
                    })}
                    treeDefaultExpandAll={false}
                />
                <Select
                    placeholder="状态"
                    value={filterActive}
                    onChange={v => { setFilterActive(v); setPage(1); }}
                    allowClear
                    style={{ width: 100 }}
                    options={[
                        { label: '启用', value: true },
                        { label: '禁用', value: false },
                    ]}
                />
                <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>

                {/* 导入导出按钮 */}
                {!isUser && (
                    <>
                        <Button icon={<DownloadOutlined />} onClick={handleExport} loading={importingId}>
                            导出
                        </Button>
                        <Button icon={<InboxOutlined />} onClick={() => { handleImportReset(); setImportOpen(true); }}>
                            导入
                        </Button>
                    </>
                )}

                {isAdmin && pendingCount > 0 && (
                    <Badge count={pendingCount} size="small">
                        <Button icon={<AuditOutlined />} onClick={() => navigate('/pending')}>
                            待审核
                        </Button>
                    </Badge>
                )}

                <div style={{ flex: 1 }} />
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                    {isUser ? '提交审核' : '新增话术'}
                </Button>
                {selectedRowKeys.length > 0 && !isUser && (
                    <Popconfirm
                        title={`确定删除选中的 ${selectedRowKeys.length} 条话术？`}
                        onConfirm={handleBatchDelete}
                    >
                        <Button danger icon={<DeleteOutlined />}>批量删除</Button>
                    </Popconfirm>
                )}
            </div>

            {/* 表格 */}
            <Table
                rowKey="id"
                columns={columns}
                dataSource={data}
                loading={loading}
                rowSelection={{
                    selectedRowKeys,
                    onChange: setSelectedRowKeys,
                }}
                scroll={{ x: 1300 }}
                pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    showTotal: (t) => `共 ${t} 条`,
                    onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                }}
            />

            {/* 新增/编辑弹窗 */}
            <Modal
                title={editingScript
                    ? (isUser ? '申请修改话术' : '编辑话术')
                    : (isUser ? '提交审核 - 新增话术' : '新增话术')}
                open={modalOpen}
                onOk={handleSave}
                onCancel={() => setModalOpen(false)}
                width={640}
                okText={isUser ? '提交审核' : '保存'}
                cancelText="取消"
            >
                <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item
                        name="content"
                        label="话术内容"
                        rules={[{ required: true, message: '请输入话术内容' }]}
                    >
                        <Input.TextArea rows={4} placeholder="请输入客服回复话术内容" />
                    </Form.Item>
                    <Form.Item name="categoryPath" label="所属分类">
                        <Cascader
                            options={categoryOptions}
                            placeholder="请选择分类（可不选）"
                            changeOnSelect
                            allowClear
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                    <Form.Item name="keywords" label="关键词（逗号分隔）">
                        <Input placeholder="例如：充电器, 充不进电, 质量问题" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* 导入弹窗 */}
            <Modal
                title="📥 导入话术"
                open={importOpen}
                onCancel={() => setImportOpen(false)}
                footer={null}
                width={800}
                destroyOnClose
            >
                {importStep === 0 && (
                    <div>
                        <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                            <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
                                下载导入模板
                            </Button>
                        </div>
                        <Upload.Dragger
                            accept=".xlsx,.xls,.csv"
                            maxCount={1}
                            showUploadList={false}
                            beforeUpload={(file) => { handleImportUpload(file); return false; }}
                        >
                            <p className="ant-upload-drag-icon">
                                <FileExcelOutlined style={{ fontSize: 48, color: '#52c41a' }} />
                            </p>
                            <p className="ant-upload-text">点击或拖拽 Excel 文件到此区域上传</p>
                            <p className="ant-upload-hint">支持 .xlsx / .xls / .csv 格式，文件大小不超过 10MB</p>
                        </Upload.Dragger>
                    </div>
                )}

                {importStep === 1 && importPreview && (
                    <div>
                        <Alert
                            message={`文件解析成功！共 ${importPreview.total_rows} 行数据，以下为前 ${importPreview.preview_rows.length} 行预览`}
                            type="success" showIcon style={{ marginBottom: 16 }}
                        />
                        <div style={{ marginBottom: 16 }}>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>列映射设置：</Text>
                            <Space wrap size={[12, 12]}>
                                <div>
                                    <Text style={{ marginRight: 8 }}>话术内容列：</Text>
                                    <Select
                                        placeholder="选择列" value={columnMapping.content || undefined}
                                        onChange={v => setColumnMapping(p => ({ ...p, content: v }))}
                                        style={{ width: 180 }} allowClear
                                        options={importPreview.headers.map(h => ({ label: h, value: h }))}
                                    />
                                </div>
                                <div>
                                    <Text style={{ marginRight: 8 }}>关键词列：</Text>
                                    <Select
                                        placeholder="选择列（可选）" value={columnMapping.keywords || undefined}
                                        onChange={v => setColumnMapping(p => ({ ...p, keywords: v }))}
                                        style={{ width: 180 }} allowClear
                                        options={importPreview.headers.map(h => ({ label: h, value: h }))}
                                    />
                                </div>
                                <div>
                                    <Text style={{ marginRight: 8 }}>分类列：</Text>
                                    <Select
                                        placeholder="选择列（可选）" value={columnMapping.category_name || undefined}
                                        onChange={v => setColumnMapping(p => ({ ...p, category_name: v }))}
                                        style={{ width: 180 }} allowClear
                                        options={importPreview.headers.map(h => ({ label: h, value: h }))}
                                    />
                                </div>
                            </Space>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>导入策略：</Text>
                            <Radio.Group value={importStrategy} onChange={e => setImportStrategy(e.target.value)}>
                                <Radio.Button value="append">追加模式（不检查重复）</Radio.Button>
                                <Radio.Button value="dedup">去重模式（按内容去重）</Radio.Button>
                            </Radio.Group>
                        </div>
                        <Table
                            columns={importPreview.headers.map(h => ({ title: h, dataIndex: h, key: h, ellipsis: true }))}
                            dataSource={importPreview.preview_rows.map((row, i) => ({ ...row, key: i }))}
                            pagination={false} scroll={{ x: 'max-content' }} size="small"
                            style={{ marginBottom: 16 }}
                        />
                        <Space>
                            <Button type="primary" icon={<ImportOutlined />} onClick={handleImportConfirm} loading={importing}>
                                确认导入 ({importPreview.total_rows} 条)
                            </Button>
                            <Button onClick={handleImportReset}>重新上传</Button>
                        </Space>
                    </div>
                )}

                {importStep === 2 && importResult && (
                    <Result
                        status={(importResult as any).fail_count === 0 ? 'success' : 'warning'}
                        title={`导入完成：成功 ${(importResult as any).success_count} 条，失败 ${(importResult as any).fail_count} 条`}
                        subTitle={
                            (importResult as any).errors?.length > 0 ? (
                                <div style={{ maxHeight: 200, overflow: 'auto', textAlign: 'left' }}>
                                    {(importResult as any).errors.map((err: string, i: number) => (
                                        <div key={i} style={{ color: '#ff4d4f', fontSize: 12 }}>{err}</div>
                                    ))}
                                </div>
                            ) : '所有数据导入成功！'
                        }
                        extra={[
                            <Button type="primary" key="continue" onClick={handleImportReset}>继续导入</Button>,
                            <Button key="close" onClick={() => setImportOpen(false)}>关闭</Button>,
                        ]}
                    />
                )}
            </Modal>
        </div>
    );
};

export default ScriptManage;
