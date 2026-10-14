import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    Input, Button, Space, Typography, message, Divider, Alert, Spin, Modal, Select, Tag, Tooltip,
} from 'antd';
import { SendOutlined, ClearOutlined, ThunderboltOutlined, FolderOpenOutlined, FileTextOutlined } from '@ant-design/icons';
import AiToggle from '../components/AiToggle';
import CategorySelector from '../components/CategorySelector';
import ScriptCardList from '../components/ScriptCardList';
import { analyzeApi } from '../api/analyze';
import { scriptApi } from '../api/scripts';
import type { ScriptMatch, AIResponseItem, TokenUsage } from '../types';
import { useAuth } from '../context/AuthContext';
import { usePageCache } from '../context/PageCacheContext';

const { TextArea } = Input;
const { Text, Title } = Typography;

const Workbench: React.FC = () => {
    const [query, setQuery] = useState('');
    const [aiMode, setAiMode] = useState(false);
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [matches, setMatches] = useState<ScriptMatch[]>([]);
    const [aiResponses, setAiResponses] = useState<AIResponseItem[]>([]);
    const [keywords, setKeywords] = useState<string[]>([]);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [fallbackMsg, setFallbackMsg] = useState('');
    const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
    const [hasAnalyzed, setHasAnalyzed] = useState(false);
    const [browseMode, setBrowseMode] = useState(false); // 浏览模式：只看分类不看分析
    const [categoryRefreshKey, setCategoryRefreshKey] = useState(0); // 用于刷新分类列表
    const [officialModalOpen, setOfficialModalOpen] = useState(false);
    const [selectedSubCategory, setSelectedSubCategory] = useState<string | undefined>(undefined);
    const [officialMode, setOfficialMode] = useState(false); // 官方流程话术模式
    const abortRef = useRef(false);
    const { user, refreshUser } = useAuth();
    const { savePageData, getPageData } = usePageCache();
    const PAGE_KEY = 'workbench';

    // 页面挂载时：恢复上次缓存的数据（不触发 API）
    useEffect(() => {
        const cached = getPageData(PAGE_KEY);
        if (cached && cached.hasAnalyzed) {
            setQuery(cached.query || '');
            setAiMode(cached.aiMode || false);
            setCategoryId(cached.categoryId ?? null);
            setMatches(cached.matches || []);
            setAiResponses(cached.aiResponses || []);
            setKeywords(cached.keywords || []);
            setSelectedIndex(cached.selectedIndex ?? null);
            setFallbackMsg(cached.fallbackMsg || '');
            setHasAnalyzed(cached.hasAnalyzed || false);
            setBrowseMode(cached.browseMode || false);
            setOfficialMode(cached.officialMode || false);
            setSelectedSubCategory(cached.selectedSubCategory);
            setTokenUsage(cached.tokenUsage || null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 卸载时保存缓存（仅在有关键数据时，避免 StrictMode 覆盖）
    useEffect(() => {
        return () => {
            if (hasAnalyzed || matches.length > 0 || aiResponses.length > 0) {
                savePageData(PAGE_KEY, {
                    query, aiMode, categoryId,
                    matches, aiResponses, keywords,
                    selectedIndex, fallbackMsg, hasAnalyzed,
                    browseMode, officialMode, selectedSubCategory, tokenUsage,
                });
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, aiMode, categoryId, matches, aiResponses, keywords,
        selectedIndex, fallbackMsg, hasAnalyzed, browseMode,
        officialMode, selectedSubCategory, tokenUsage]);

    // 官方流程话术子分类列表
    const officialSubCategories = [
        '自我介绍', '开场白', '询问客户需求', '确认信息',
        '安抚情绪', '婉拒请求', '道歉致歉',
        '结束语', '好评请求', '转接人工',
        '投诉处理', '回访跟进',
    ];

    const handleOfficialAnalyze = useCallback(async (subCategory: string) => {
        if (!query.trim()) {
            message.warning('请输入客户问题或场景描述');
            return;
        }

        setLoading(true);
        setHasAnalyzed(true);
        setSelectedIndex(null);
        setBrowseMode(false);
        setOfficialMode(true);
        setFallbackMsg('');
        setTokenUsage(null);
        abortRef.current = false;

        try {
            const res = await analyzeApi.official({
                query: query.trim(),
                sub_category: subCategory,
                matched_scenario: `客户输入：${query.trim()}，需要生成「${subCategory}」类官方话术`,
            });
            const data = res.data.data;
            if (!abortRef.current) {
                setAiResponses(data.responses || []);
                setMatches([]);
                if (data.token_usage) {
                    setTokenUsage(data.token_usage);
                }
                if (data.fallback) {
                    setFallbackMsg(data.fallback_message || '');
                }
                // 缓存官方流程话术结果
                savePageData(PAGE_KEY, {
                    query, aiMode: true, categoryId,
                    matches: [], aiResponses: data.responses || [],
                    keywords: [], tokenUsage: data.token_usage || null,
                    selectedIndex: null, fallbackMsg: data.fallback ? (data.fallback_message || '') : '',
                    hasAnalyzed: true, browseMode: false,
                    officialMode: true, selectedSubCategory: subCategory,
                });
            }
        } catch {
            if (!abortRef.current) {
                message.error('分析失败，请重试');
            }
        } finally {
            if (!abortRef.current) {
                setLoading(false);
            }
        }
    }, [query, savePageData, PAGE_KEY]);

    // 选择分类后自动展示该分类下的话术
    useEffect(() => {
        if (categoryId !== null) {
            setBrowseMode(true);
            setLoading(true);
            setHasAnalyzed(true);
            setSelectedIndex(null);
            setAiResponses([]);
            scriptApi.list({ category_id: categoryId, page_size: 20 })
                .then(res => {
                    if (!abortRef.current) {
                        const items = res.data.data.items;
                        // 转为 ScriptMatch 格式展示
                        const scriptMatches: ScriptMatch[] = items.map(s => ({
                            script_id: s.id,
                            content: s.content,
                            score: 0,
                            category_name: s.category_name,
                            keywords: s.keywords,
                            usage_count: s.usage_count,
                            source: s.source,
                        }));
                        setMatches(scriptMatches);
                        setKeywords([]);
                    }
                })
                .catch(() => { })
                .finally(() => { if (!abortRef.current) setLoading(false); });
        } else {
            if (!hasAnalyzed) {
                setBrowseMode(false);
                setMatches([]);
                setAiResponses([]);
                setHasAnalyzed(false);
            }
        }
    }, [categoryId]);

    const handleAnalyze = useCallback(async () => {
        if (!query.trim()) {
            message.warning('请输入客户问题');
            return;
        }

        setLoading(true);
        setHasAnalyzed(true);
        setSelectedIndex(null);
        setBrowseMode(false); // 退出浏览模式，进入分析模式
        setFallbackMsg('');
        setTokenUsage(null);
        abortRef.current = false;

        try {
            if (aiMode) {
                const res = await analyzeApi.ai({ query: query.trim(), category_id: categoryId });
                const data = res.data.data;
                if (!abortRef.current) {
                    setAiResponses(data.responses || []);
                    setMatches([]);
                    if (data.token_usage) {
                        setTokenUsage(data.token_usage);
                    }
                    if (data.fallback) {
                        setFallbackMsg(data.fallback_message || '');
                    }
                    // 刷新用户信息（Token 统计）
                    refreshUser().catch(() => { });
                    // 缓存分析结果
                    savePageData(PAGE_KEY, {
                        query, aiMode, categoryId,
                        matches: [], aiResponses: data.responses || [],
                        keywords: [], tokenUsage: data.token_usage || null,
                        selectedIndex: null, fallbackMsg: data.fallback ? (data.fallback_message || '') : '',
                        hasAnalyzed: true, browseMode: false,
                        officialMode: false, selectedSubCategory: undefined,
                    });
                }
            } else {
                const res = await analyzeApi.local({ query: query.trim(), category_id: categoryId });
                const data = res.data.data;
                if (!abortRef.current) {
                    setMatches(data.matches || []);
                    setKeywords(data.query_keywords || []);
                    setAiResponses([]);
                    // 缓存本地匹配结果
                    savePageData(PAGE_KEY, {
                        query, aiMode: false, categoryId,
                        matches: data.matches || [], aiResponses: [],
                        keywords: data.query_keywords || [], tokenUsage: null,
                        selectedIndex: null, fallbackMsg: '',
                        hasAnalyzed: true, browseMode: false,
                        officialMode: false, selectedSubCategory: undefined,
                    });
                }
            }
        } catch (err) {
            if (!abortRef.current) {
                message.error('分析失败，请重试');
            }
        } finally {
            if (!abortRef.current) {
                setLoading(false);
            }
        }
    }, [query, aiMode, categoryId, savePageData, PAGE_KEY]);

    const handleClear = () => {
        abortRef.current = true;
        setQuery('');
        setMatches([]);
        setAiResponses([]);
        setKeywords([]);
        setSelectedIndex(null);
        setHasAnalyzed(false);
        setBrowseMode(false);
        setOfficialMode(false);
        setSelectedSubCategory(undefined);
        setFallbackMsg('');
        setTokenUsage(null);
        setLoading(false);
        // 清空页面缓存
        savePageData(PAGE_KEY, {});
    };

    const handleSelect = async (index: number) => {
        setSelectedIndex(index);

        let content = '';
        let scriptId: number | null = null;

        if ((aiMode || officialMode) && aiResponses[index]) {
            content = aiResponses[index].content;
        } else if (matches[index]) {
            content = matches[index].content;
            scriptId = matches[index].script_id;
        }

        const mode = officialMode ? 'ai' : (aiMode ? 'ai' : 'local');

        // 提交反馈
        try {
            await analyzeApi.feedback({
                script_id: scriptId,
                content: content,
                category_id: categoryId,
                query: query.trim() || undefined,
                mode,
            });
            const msg = officialMode
                ? '官方话术已选用并提交审核'
                : (aiMode ? 'AI回复已选用并入库' : '话术已选用，使用次数+1');
            message.success(msg);
            // 刷新分类列表（AI可能创建了新分类）
            setCategoryRefreshKey(k => k + 1);
        } catch {
            // 反馈失败不影响使用
        }
    };

    const handleRate = (index: number, rating: number) => {
        if (matches[index]) {
            analyzeApi.feedback({
                script_id: matches[index].script_id,
                mode: 'local',
                rating,
            }).then(() => {
                message.success(rating === 1 ? '感谢反馈！' : '已记录，我们会优化话术');
            }).catch(() => { });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            handleAnalyze();
        }
    };

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            {/* 顶部工具栏 */}
            <div className="workbench-hero">
                <div>
                    <div className="page-eyebrow">工作空间</div>
                    <div className="page-title">客服工作台</div>
                    <div className="page-lead">粘贴客户反馈，或用本地匹配与大模型快速生成恰到好处的客服回复</div>
                </div>
                <Tooltip title={!user?.has_api_key ? '未配置 API Key，请在右上角账号菜单中配置后使用 AI 功能' : undefined}>
                    <span>
                        <AiToggle
                            checked={aiMode}
                            disabled={!user?.has_api_key}
                            onChange={(v) => {
                                setAiMode(v);
                                setMatches([]);
                                setAiResponses([]);
                                setSelectedIndex(null);
                                setHasAnalyzed(false);
                                setBrowseMode(false);
                                setOfficialMode(false);
                                setSelectedSubCategory(undefined);
                            }}
                        />
                    </span>
                </Tooltip>
            </div>

            {/* 问题输入区 */}
            <div className="analyze-panel">
                <TextArea
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="请粘贴客户在微信中反馈的问题，如：我买的充电器用了两天就充不进电了，这质量也太差了！"
                    rows={3}
                    style={{ fontSize: 14, resize: 'none' }}
                    disabled={loading}
                />
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 8,
                }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {query.length} 字 &nbsp;|&nbsp; Ctrl+Enter 快速分析
                    </Text>
                    <Space>
                        <Button icon={<ClearOutlined />} onClick={handleClear} disabled={loading}>
                            清空
                        </Button>
                        {aiMode && (
                            <Tooltip title={!user?.has_api_key ? '未配置 API Key，无法使用 AI 官方流程话术功能' : undefined}>
                                <Button
                                    icon={<FileTextOutlined />}
                                    onClick={() => setOfficialModalOpen(true)}
                                    disabled={loading || !query.trim() || !user?.has_api_key}
                                >
                                    官方流程话术
                                </Button>
                            </Tooltip>
                        )}
                        <Tooltip title={aiMode && !user?.has_api_key ? '未配置 API Key，请在右上角账号菜单中配置' : undefined}>
                            <Button
                                type="primary"
                                icon={aiMode ? <ThunderboltOutlined /> : <SendOutlined />}
                                onClick={handleAnalyze}
                                loading={loading}
                                disabled={!query.trim() || (aiMode && !user?.has_api_key)}
                            >
                                {aiMode ? 'AI 智能分析' : '开始分析'}
                            </Button>
                        </Tooltip>
                    </Space>
                </div>
            </div>

            {/* 分类选择 */}
            <div style={{ marginBottom: 20 }}>
                <span className="section-label">问题分类（可选，用于缩小匹配范围）</span>
                <CategorySelector value={categoryId} onChange={setCategoryId} refreshKey={categoryRefreshKey} />
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* 关键词展示 */}
            {keywords.length > 0 && !aiMode && (
                <div style={{ marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>提取关键词：</Text>
                    {keywords.map((kw, i) => (
                        <Text key={i} code style={{ marginLeft: 4, fontSize: 12 }}>{kw}</Text>
                    ))}
                </div>
            )}

            {/* 降级提示 */}
            {fallbackMsg && (
                <Alert
                    message={fallbackMsg}
                    type="warning"
                    showIcon
                    closable
                    style={{ marginBottom: 12 }}
                    onClose={() => setFallbackMsg('')}
                />
            )}

            {/* 分析结果 */}
            {hasAnalyzed && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text strong style={{ fontSize: 14 }}>
                            {browseMode ? (
                                <><FolderOpenOutlined style={{ marginRight: 4 }} />该分类下的话术</>
                            ) : officialMode ? (
                                <><FileTextOutlined style={{ marginRight: 4 }} />官方流程话术 - {selectedSubCategory}</>
                            ) : (
                                aiMode ? 'AI 生成回复' : '匹配结果'
                            )}
                            {browseMode && matches.length > 0 && (
                                <Text style={{ fontWeight: 'normal', fontSize: 13, marginLeft: 8 }}>
                                    （点击"选用"确认使用，或在上方输入问题后点击"分析"进行精准匹配）
                                </Text>
                            )}
                            {!browseMode && !aiMode && (
                                <Text style={{ fontWeight: 'normal', fontSize: 13, marginLeft: 8 }}>
                                    （点击"选用"确认使用）
                                </Text>
                            )}
                        </Text>
                        {tokenUsage && (aiMode || officialMode) && (
                            <Tag color="purple" style={{ fontSize: 12 }}>
                                <ThunderboltOutlined /> 消耗 {tokenUsage.total_tokens} Tokens（提示词 {tokenUsage.prompt_tokens} + 回复 {tokenUsage.completion_tokens}）
                            </Tag>
                        )}
                    </div>
                    <ScriptCardList
                        loading={loading}
                        isAI={browseMode ? false : aiMode}
                        matches={matches}
                        aiResponses={aiResponses}
                        selectedIndex={selectedIndex}
                        onSelect={handleSelect}
                        onRate={!aiMode ? handleRate : undefined}
                    />
                </div>
            )}

            {!hasAnalyzed && !loading && (
                <div className="empty-state">
                    <div className="empty-icon"><ThunderboltOutlined /></div>
                    <div className="empty-title">开始分析</div>
                    <div className="empty-desc">选择左侧问题分类快速浏览话术，或输入问题后点击分析</div>
                </div>
            )}

            {/* 官方流程话术 - 选择子分类弹窗 */}
            <Modal
                title="选择官方流程话术类型"
                open={officialModalOpen}
                onCancel={() => setOfficialModalOpen(false)}
                footer={null}
                width={480}
            >
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">请选择您需要的官方流程话术类型，系统将根据客户输入为您生成 5 条对应话术：</Text>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {officialSubCategories.map(cat => (
                        <Tag
                            key={cat}
                            color="blue"
                            style={{
                                padding: '6px 16px',
                                fontSize: 14,
                                cursor: 'pointer',
                                borderRadius: 4,
                                margin: 0,
                            }}
                            onClick={() => {
                                setSelectedSubCategory(cat);
                                setOfficialModalOpen(false);
                                handleOfficialAnalyze(cat);
                            }}
                        >
                            {cat}
                        </Tag>
                    ))}
                </div>
            </Modal>
        </div>
    );
};

export default Workbench;
