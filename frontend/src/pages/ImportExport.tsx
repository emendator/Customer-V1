import React, { useState } from 'react';
import {
    Upload, Button, Table, Select, Space, message, Typography,
    Result, Steps, Card, Radio, Alert, Divider,
} from 'antd';
import {
    InboxOutlined, DownloadOutlined, ImportOutlined,
    FileExcelOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { uploadApi } from '../api/upload';
import type { ExcelPreview, ImportResult } from '../types';
import PageHeader from '../components/PageHeader';

const { Dragger } = Upload;
const { Text, Title } = Typography;

const ImportExport: React.FC = () => {
    const [step, setStep] = useState(0); // 0=上传, 1=预览映射, 2=结果
    const [preview, setPreview] = useState<ExcelPreview | null>(null);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [strategy, setStrategy] = useState('append');
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);

    const handleUpload: UploadProps['customRequest'] = async (options) => {
        const file = options.file as File;
        try {
            const res = await uploadApi.uploadExcel(file);
            const data = res.data.data;
            setPreview(data);
            setStep(1);
            // 自动映射：尝试匹配列名
            const autoMapping: Record<string, string> = {};
            for (const h of data.headers) {
                if (h.includes('话术') || h.includes('内容')) autoMapping.content = h;
                if (h.includes('关键词') || h.includes('标签')) autoMapping.keywords = h;
                if (h.includes('分类')) autoMapping.category_name = h;
            }
            setColumnMapping(autoMapping);
            options.onSuccess?.(data);
        } catch (err: any) {
            options.onError?.(err);
        }
    };

    const handleImport = async () => {
        if (!preview) return;
        if (!columnMapping.content) {
            message.warning('请至少映射"话术内容"列');
            return;
        }
        setImporting(true);
        try {
            const res = await uploadApi.importData({
                filename: preview.filename,
                column_mapping: columnMapping,
                strategy,
            });
            setResult(res.data.data);
            setStep(2);
        } catch {
            // handled
        } finally {
            setImporting(false);
        }
    };

    const handleExport = async () => {
        try {
            const res = await uploadApi.exportScripts();
            const blob = new Blob([res.data]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '话术库导出.xlsx';
            a.click();
            URL.revokeObjectURL(url);
            message.success('导出成功');
        } catch {
            message.error('导出失败');
        }
    };

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
        } catch {
            message.error('下载失败');
        }
    };

    const handleReset = () => {
        setStep(0);
        setPreview(null);
        setColumnMapping({});
        setResult(null);
    };

    const previewColumns = preview?.headers.map(h => ({
        title: h,
        dataIndex: h,
        key: h,
        ellipsis: true,
    })) || [];

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <PageHeader title="数据导入导出" lead="批量导入与备份导出 Excel 话术" />

            {/* 导入区 */}
            <Card title="📥 导入话术" style={{ marginBottom: 24 }}>
                {step === 0 && (
                    <div>
                        <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                            <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
                                下载导入模板
                            </Button>
                        </div>
                        <Dragger
                            accept=".xlsx,.xls,.csv"
                            maxCount={1}
                            customRequest={handleUpload}
                            showUploadList={false}
                        >
                            <p className="ant-upload-drag-icon">
                                <FileExcelOutlined style={{ fontSize: 48, color: '#52c41a' }} />
                            </p>
                            <p className="ant-upload-text">点击或拖拽 Excel 文件到此区域上传</p>
                            <p className="ant-upload-hint">
                                支持 .xlsx / .xls / .csv 格式，文件大小不超过 10MB
                            </p>
                        </Dragger>
                    </div>
                )}

                {step === 1 && preview && (
                    <div>
                        <Alert
                            message={`文件解析成功！共 ${preview.total_rows} 行数据，以下为前 ${preview.preview_rows.length} 行预览`}
                            type="success"
                            showIcon
                            style={{ marginBottom: 16 }}
                        />

                        {/* 列映射 */}
                        <div style={{ marginBottom: 16 }}>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>列映射设置：</Text>
                            <Space wrap size={[12, 12]}>
                                <div>
                                    <Text style={{ marginRight: 8 }}>话术内容列：</Text>
                                    <Select
                                        placeholder="选择列"
                                        value={columnMapping.content || undefined}
                                        onChange={v => setColumnMapping(prev => ({ ...prev, content: v }))}
                                        style={{ width: 180 }}
                                        allowClear
                                        options={preview.headers.map(h => ({ label: h, value: h }))}
                                    />
                                </div>
                                <div>
                                    <Text style={{ marginRight: 8 }}>关键词列：</Text>
                                    <Select
                                        placeholder="选择列（可选）"
                                        value={columnMapping.keywords || undefined}
                                        onChange={v => setColumnMapping(prev => ({ ...prev, keywords: v }))}
                                        style={{ width: 180 }}
                                        allowClear
                                        options={preview.headers.map(h => ({ label: h, value: h }))}
                                    />
                                </div>
                                <div>
                                    <Text style={{ marginRight: 8 }}>分类列：</Text>
                                    <Select
                                        placeholder="选择列（可选）"
                                        value={columnMapping.category_name || undefined}
                                        onChange={v => setColumnMapping(prev => ({ ...prev, category_name: v }))}
                                        style={{ width: 180 }}
                                        allowClear
                                        options={preview.headers.map(h => ({ label: h, value: h }))}
                                    />
                                </div>
                            </Space>
                        </div>

                        {/* 导入策略 */}
                        <div style={{ marginBottom: 16 }}>
                            <Text strong style={{ display: 'block', marginBottom: 8 }}>导入策略：</Text>
                            <Radio.Group value={strategy} onChange={e => setStrategy(e.target.value)}>
                                <Radio.Button value="append">追加模式（不检查重复）</Radio.Button>
                                <Radio.Button value="dedup">去重模式（按内容去重）</Radio.Button>
                            </Radio.Group>
                        </div>

                        {/* 预览表格 */}
                        <Table
                            columns={previewColumns}
                            dataSource={preview.preview_rows.map((row, i) => ({ ...row, key: i }))}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size="small"
                            style={{ marginBottom: 16 }}
                        />

                        <Space>
                            <Button type="primary" icon={<ImportOutlined />} onClick={handleImport} loading={importing}>
                                确认导入 ({preview.total_rows} 条)
                            </Button>
                            <Button onClick={handleReset}>重新上传</Button>
                        </Space>
                    </div>
                )}

                {step === 2 && result && (
                    <Result
                        status={result.fail_count === 0 ? 'success' : 'warning'}
                        title={`导入完成：成功 ${result.success_count} 条，失败 ${result.fail_count} 条`}
                        subTitle={
                            result.errors.length > 0 ? (
                                <div style={{ maxHeight: 200, overflow: 'auto', textAlign: 'left' }}>
                                    {result.errors.map((err, i) => (
                                        <div key={i} style={{ color: '#ff4d4f', fontSize: 12 }}>{err}</div>
                                    ))}
                                </div>
                            ) : '所有数据导入成功！'
                        }
                        extra={[
                            <Button type="primary" key="reset" onClick={handleReset}>继续导入</Button>,
                        ]}
                    />
                )}
            </Card>

            {/* 导出区 */}
            <Card title="📤 导出话术">
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    将话术库的全部数据导出为 Excel 文件，可用于备份或迁移
                </Text>
                <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    onClick={handleExport}
                    size="large"
                >
                    导出全部话术
                </Button>
            </Card>
        </div>
    );
};

export default ImportExport;
