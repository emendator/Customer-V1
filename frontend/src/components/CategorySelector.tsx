import React, { useEffect, useState } from 'react';
import { Button, Space, Tag, Spin } from 'antd';
import { FolderOutlined } from '@ant-design/icons';
import { categoryApi } from '../api/categories';
import type { CategoryNode } from '../types';

interface CategorySelectorProps {
    value: number | null;
    onChange: (categoryId: number | null) => void;
    refreshKey?: number;
}

const CategorySelector: React.FC<CategorySelectorProps> = ({ value, onChange, refreshKey = 0 }) => {
    const [tree, setTree] = useState<CategoryNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedParent, setSelectedParent] = useState<number | null>(null);

    const fetchCategories = () => {
        setLoading(true);
        categoryApi.getTree()
            .then(res => setTree(res.data.data || []))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchCategories();
    }, [refreshKey]);

    // 找到选中分类对应的父分类
    useEffect(() => {
        if (value) {
            for (const parent of tree) {
                if (parent.id === value) {
                    setSelectedParent(parent.id);
                    return;
                }
                if (parent.children.some(c => c.id === value)) {
                    setSelectedParent(parent.id);
                    return;
                }
            }
        } else {
            setSelectedParent(null);
        }
    }, [value, tree]);

    const handleParentClick = (parentId: number) => {
        if (selectedParent === parentId) {
            setSelectedParent(null);
            onChange(null);
        } else {
            setSelectedParent(parentId);
            onChange(parentId);
        }
    };

    const handleChildClick = (childId: number) => {
        if (value === childId) {
            onChange(null);
        } else {
            onChange(childId);
        }
    };

    if (loading) return <Spin size="small" />;
    if (!tree.length) return <span style={{ color: 'var(--ink-faint)' }}>暂无分类</span>;

    const selectedParentNode = tree.find(p => p.id === selectedParent);

    return (
        <div>
            {/* 一级分类按钮 */}
            <Space wrap size={[8, 8]} style={{ marginBottom: 12 }}>
                {tree.map(parent => (
                    <Button
                        key={parent.id}
                        className="cat-pill"
                        type={selectedParent === parent.id ? 'primary' : 'default'}
                        size="middle"
                        icon={<FolderOutlined />}
                        onClick={() => handleParentClick(parent.id)}
                    >
                        {parent.name}
                        <span style={{ fontSize: 12, marginLeft: 4, opacity: 0.7 }}>
                            ({parent.script_count})
                        </span>
                    </Button>
                ))}
                {value && (
                    <Button className="cat-pill" size="middle" danger onClick={() => { setSelectedParent(null); onChange(null); }}>
                        清除筛选
                    </Button>
                )}
            </Space>

            {/* 二级分类标签 */}
            {selectedParentNode && selectedParentNode.children.length > 0 && (
                <div className="cat-subpanel">
                    <span style={{ color: 'var(--ink-soft)', marginRight: 8, fontSize: 13 }}>细分：</span>
                    {selectedParentNode.children.map(child => (
                        <Tag.CheckableTag
                            key={child.id}
                            checked={value === child.id}
                            onChange={() => handleChildClick(child.id)}
                            style={{ marginBottom: 4 }}
                        >
                            {child.name} ({child.script_count})
                        </Tag.CheckableTag>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CategorySelector;
