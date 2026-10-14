import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin, Result } from 'antd';
import { useAuth } from '../context/AuthContext';

interface AuthRouteProps {
    children: React.ReactNode;
    roles?: string[];
}

const AuthRoute: React.FC<AuthRouteProps> = ({ children, roles }) => {
    const { user, isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Spin size="large" tip="加载中..." />
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // 公司信息未完善：强制前往补全页（保证公司数据隔离逻辑正常运行）
    if (user?.needs_company && location.pathname !== '/complete-profile') {
        return <Navigate to="/complete-profile" replace />;
    }

    if (roles && user && !roles.includes(user.role)) {
        return (
            <Result
                status="403"
                title="权限不足"
                subTitle="抱歉，您没有权限访问此页面"
            />
        );
    }

    return <>{children}</>;
};

export default AuthRoute;
