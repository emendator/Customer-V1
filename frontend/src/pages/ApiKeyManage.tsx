import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Input, Button, message, Tag, Space, Statistic, Row, Col, Alert, Descriptions } from 'antd';
import { ArrowLeftOutlined, KeyOutlined, CheckCircleOutlined, CloseCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { userApi } from '../api/users';
import { useCountUp } from '../hooks/useCountUp';
import PageHeader from '../components/PageHeader';

const { Title, Text, Paragraph } = Typography;

const ApiKeyManage: React.FC = () => {
    const navigate = useNavigate();
    const { user, refreshUser } = useAuth();
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [keyStatus, setKeyStatus] = useState<{ has_key: boolean; mask: string; total_tokens_spent: number } | null>(null);
    const totalTokens = useCountUp(keyStatus?.total_tokens_spent || 0);

    useEffect(() => {
        userApi.getApiKeyStatus().then(res => setKeyStatus(res.data.data)).catch(() => { });
    }, []);

    const handleSave = async () => {
        const trimmed = apiKey.trim();
        if (!trimmed) {
            message.warning('请输入 API Key');
            return;
        }
        if (!trimmed.startsWith('sk-')) {
            message.warning('API Key 格式错误，应以 sk- 开头');
            return;
        }
        setSaving(true);
        try {
            await userApi.updateApiKey({ api_key: trimmed });
            message.success('API Key 已保存（加密存储）');
            setApiKey('');
            const res = await userApi.getApiKeyStatus();
            setKeyStatus(res.data.data);
            await refreshUser();
        } catch {
            // handled
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <Button
                type="link"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(-1)}
                style={{ padding: 0, marginBottom: 12 }}
            >
                返回
            </Button>
            <PageHeader eyebrow="账号设置" title="API Key 配置" lead="配置 DeepSeek API Key 以启用 AI 能力" />

            <Alert
                message="需要 DeepSeek API Key"
                description="本系统的 AI 功能需要 DeepSeek API Key 才能使用。请前往 platform.deepseek.com 获取您的 API Key，注意 API Key 以 sk- 开头。"
                type="info"
                showIcon
                style={{ marginBottom: 20 }}
            />

            <Card title="当前状态" style={{ marginBottom: 20 }}>
                <Descriptions column={1}>
                    <Descriptions.Item label="API Key 状态">
                        {keyStatus?.has_key ? (
                            <Tag icon={<CheckCircleOutlined />} color="success">已配置</Tag>
                        ) : (
                            <Tag icon={<CloseCircleOutlined />} color="error">未配置</Tag>
                        )}
                    </Descriptions.Item>
                    {keyStatus?.has_key && (
                        <Descriptions.Item label="API Key">
                            <Text code>{keyStatus.mask}</Text>
                        </Descriptions.Item>
                    )}
                    <Descriptions.Item label="累计 Token 消耗">
                        <span className="stat-number"><ThunderboltOutlined /> {totalTokens.toLocaleString()} Tokens</span>
                    </Descriptions.Item>
                </Descriptions>
            </Card>

            <Card title={keyStatus?.has_key ? "更新 API Key" : "设置 API Key"}>
                <Input.Password
                    placeholder={keyStatus?.has_key ? "输入新的 API Key 以替换现有 Key" : "粘贴您的 DeepSeek API Key（sk-...）"}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    size="large"
                    prefix={<KeyOutlined />}
                    visibilityToggle
                    style={{ marginBottom: 16 }}
                />
                <Button
                    type="primary"
                    onClick={handleSave}
                    loading={saving}
                    disabled={!apiKey.trim()}
                    block
                    size="large"
                >
                    {keyStatus?.has_key ? '更新 API Key' : '保存 API Key'}
                </Button>
                <Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12, marginBottom: 0 }}>
                    API Key 将使用 AES-256-GCM 加密存储，不会以明文形式保存在数据库中。
                </Paragraph>
            </Card>
        </div>
    );
};

export default ApiKeyManage;
