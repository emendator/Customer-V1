import React from 'react';

interface PageHeaderProps {
    eyebrow?: string;
    title: string;
    lead?: string;
    children?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, lead, children }) => {
    return (
        <div className="page-header">
            <div className="page-header-text">
                {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
                <h1 className="page-title">{title}</h1>
                {lead && <p className="page-lead">{lead}</p>}
            </div>
            {children && <div className="page-header-actions">{children}</div>}
        </div>
    );
};

export default PageHeader;
