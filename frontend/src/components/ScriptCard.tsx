import React from 'react';
import { Card, Button, Space, Typography, Tooltip } from 'antd';
import {
    CopyOutlined,
    CheckCircleOutlined,
    LikeOutlined,
    DislikeOutlined,
    RobotOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useTilt } from '../hooks/useTilt';

const { Paragraph } = Typography;

interface ScriptCardProps {
    index: number;
    content: string;
    score?: number;
    angle?: string;
    tone?: string;
    categoryName?: string;
    usageCount?: number;
    source?: string;
    isAI?: boolean;
    onSelect: () => void;
    onRate?: (rating: number) => void;
    selected?: boolean;
}

const ScriptCard: React.FC<ScriptCardProps> = ({
    index, content, score, angle, tone,
    categoryName, usageCount, source,
    isAI = false, onSelect, onRate, selected = false,
}) => {
    const { ref, onPointerMove, onPointerLeave } = useTilt<HTMLDivElement>(4);
    const handleCopy = () => {
        navigator.clipboard.writeText(content);
    };

    const scorePercent = score ? Math.round(score * 100) : 0;

    return (
        <div className="stagger-item" style={{ animationDelay: `${index * 0.06}s` }}>
            <div
                ref={ref}
                onPointerMove={onPointerMove}
                onPointerLeave={onPointerLeave}
                style={{ transition: 'transform 0.3s ease', willChange: 'transform' }}
            >
                <Card
                    size="small"
                    className={`script-card ${selected ? 'is-selected' : ''}`}
                    title={
                        <Space size={8} wrap>
                            <span className={`chip ${isAI ? 'accent' : 'soft'}`}>
                                {isAI ? <><RobotOutlined /> AI 生成</> : <><SearchOutlined /> 本地匹配</>}
                            </span>
                            <span className="chip mute">回复 #{index}</span>
                            {score !== undefined && (
                                <span className={`chip ${scorePercent >= 70 ? 'soft' : scorePercent >= 40 ? 'warn' : 'mute'}`}>
                                    匹配度 {scorePercent}%
                                </span>
                            )}
                            {angle && <span className="chip">{angle}</span>}
                            {tone && <span className="chip soft">{tone}</span>}
                            {categoryName && <span className="chip">{categoryName}</span>}
                            {usageCount !== undefined && usageCount > 0 && (
                                <span className="chip mute">使用 {usageCount} 次</span>
                            )}
                        </Space>
                    }
                    actions={[
                        <Tooltip title="复制内容" key="copy">
                            <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopy}>
                                复制
                            </Button>
                        </Tooltip>,
                        <Tooltip title="选择使用" key="select">
                            <Button
                                type={selected ? 'primary' : 'text'}
                                size="small"
                                icon={<CheckCircleOutlined />}
                                onClick={onSelect}
                            >
                                {selected ? '已选用' : '选用'}
                            </Button>
                        </Tooltip>,
                        onRate && (
                            <Space key="rate" size={0}>
                                <Tooltip title="有用">
                                    <Button type="text" size="small" icon={<LikeOutlined />} onClick={() => onRate(1)} />
                                </Tooltip>
                                <Tooltip title="无用">
                                    <Button type="text" size="small" icon={<DislikeOutlined />} onClick={() => onRate(0)} />
                                </Tooltip>
                            </Space>
                        ),
                    ].filter(Boolean)}
                >
                    <Paragraph
                        className="script-content"
                        style={{ margin: 0 }}
                        ellipsis={{ rows: 4, expandable: true, symbol: '展开' }}
                    >
                        {content}
                    </Paragraph>
                </Card>
            </div>
        </div>
    );
};

export default ScriptCard;
