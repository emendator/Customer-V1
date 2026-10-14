import React from 'react';
import { Switch, Typography } from 'antd';
import { RobotOutlined, SearchOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface AiToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}

const AiToggle: React.FC<AiToggleProps> = ({ checked, onChange, disabled }) => {
    return (
        <div className="ai-toggle" data-mode={checked ? 'ai' : 'local'}>
            <span className={`chip ${checked ? 'soft' : 'mute'}`}>
                {checked ? <RobotOutlined /> : <SearchOutlined />}
                <Text>{checked ? 'AI 智能分析' : '本地匹配'}</Text>
            </span>
            <Switch
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                size="small"
            />
            <span className={`chip ${checked ? 'accent' : 'mute'}`}>
                {checked ? '大模型模式' : '离线模式'}
            </span>
        </div>
    );
};

export default AiToggle;
