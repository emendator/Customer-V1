import React from 'react';
import { Empty, Skeleton, Typography } from 'antd';
import ScriptCard from './ScriptCard';
import type { ScriptMatch, AIResponseItem } from '../types';

const { Text } = Typography;

interface ScriptCardListProps {
    loading: boolean;
    isAI: boolean;
    matches?: ScriptMatch[];
    aiResponses?: AIResponseItem[];
    selectedIndex: number | null;
    onSelect: (index: number) => void;
    onRate?: (index: number, rating: number) => void;
}

const ScriptCardList: React.FC<ScriptCardListProps> = ({
    loading, isAI, matches, aiResponses,
    selectedIndex, onSelect, onRate,
}) => {
    if (loading) {
        return (
            <div style={{ padding: 16 }}>
                {[1, 2, 3].map(i => (
                    <Skeleton key={i} active title={false} paragraph={{ rows: 2 }} style={{ marginBottom: 12 }} />
                ))}
            </div>
        );
    }

    if (!isAI && (!matches || matches.length === 0)) {
        return (
            <Empty
                description="请输入客户问题并点击分析，或选择分类后查看匹配结果"
                style={{ padding: 40 }}
            />
        );
    }

    if (isAI && (!aiResponses || aiResponses.length === 0)) {
        return (
            <Empty
                description="AI 暂未生成回复，请检查 API 配置或重试"
                style={{ padding: 40 }}
            />
        );
    }

    return (
        <div style={{ padding: '0 4px' }}>
            {!isAI && matches?.map((match, i) => (
                <ScriptCard
                    key={match.script_id}
                    index={i + 1}
                    content={match.content}
                    score={match.score}
                    categoryName={match.category_name || undefined}
                    usageCount={match.usage_count}
                    source={match.source}
                    isAI={false}
                    selected={selectedIndex === i}
                    onSelect={() => onSelect(i)}
                    onRate={onRate ? (r) => onRate(i, r) : undefined}
                />
            ))}
            {isAI && aiResponses?.map((item, i) => (
                <ScriptCard
                    key={i}
                    index={i + 1}
                    content={item.content}
                    angle={item.angle}
                    tone={item.tone}
                    isAI={true}
                    selected={selectedIndex === i}
                    onSelect={() => onSelect(i)}
                    onRate={onRate ? (r) => onRate(i, r) : undefined}
                />
            ))}
        </div>
    );
};

export default ScriptCardList;
