import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { PageCacheProvider } from './context/PageCacheContext';
import AuthRoute from './components/AuthRoute';
import AppLayout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import CompleteProfile from './pages/CompleteProfile';
import Workbench from './pages/Workbench';
import ScriptManage from './pages/ScriptManage';
import CategoryManage from './pages/CategoryManage';
import UserManage from './pages/UserManage';
import PendingReview from './pages/PendingReview';
import ApiKeyManage from './pages/ApiKeyManage';

const AppInner: React.FC = () => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <ConfigProvider
            locale={zhCN}
            theme={{
                algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
                token: {
                    colorPrimary: isDark ? '#7c8ef0' : '#4356c7',
                    colorInfo: isDark ? '#7c8ef0' : '#4356c7',
                    colorLink: isDark ? '#7c8ef0' : '#4356c7',
                    colorSuccess: isDark ? '#5fbf8a' : '#3e8e63',
                    colorWarning: isDark ? '#e0a84c' : '#b9822e',
                    colorError: isDark ? '#e0675d' : '#c2483f',
                    borderRadius: 10,
                    borderRadiusLG: 14,
                    colorBgLayout: isDark ? '#101013' : '#f7f6f3',
                    colorBgContainer: isDark ? '#17171a' : '#ffffff',
                    colorBorder: isDark ? '#3a3a40' : '#dcd7ce',
                    colorBorderSecondary: isDark ? '#2e2e33' : '#e7e3dc',
                    colorText: isDark ? '#f2f1ef' : '#1c1b19',
                    colorTextSecondary: isDark ? '#c0bdb6' : '#55514b',
                    colorTextTertiary: isDark ? '#8f8b84' : '#8b867e',
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif",
                    fontSize: 14,
                    boxShadow: isDark
                        ? '0 6px 24px -8px rgba(0, 0, 0, 0.55)'
                        : '0 6px 24px -8px rgba(28, 27, 25, 0.10)',
                },
            }}
        >
            <BrowserRouter>
                <AuthProvider>
                    <PageCacheProvider>
                        <Routes>
                            {/* 公开页面 */}
                            <Route path="/login" element={<Login />} />
                            <Route path="/register" element={<Register />} />

                            {/* 需要登录但不需要公司信息 */}
                            <Route path="/complete-profile" element={
                                <AuthRoute><CompleteProfile /></AuthRoute>
                            } />
                            {/* 需要登录的页面 */}
                            <Route path="/api-key" element={
                                <AuthRoute><AppLayout /></AuthRoute>
                            }>
                                <Route index element={<ApiKeyManage />} />
                            </Route>
                            <Route path="/" element={
                                <AuthRoute><AppLayout /></AuthRoute>
                            }>
                                <Route index element={<Navigate to="/workbench" replace />} />
                                <Route path="workbench" element={<Workbench />} />
                                <Route path="scripts" element={<ScriptManage />} />
                                <Route path="categories" element={
                                    <AuthRoute roles={['super_admin', 'admin', 'guest']}>
                                        <CategoryManage />
                                    </AuthRoute>
                                } />
                                <Route path="users" element={
                                    <AuthRoute roles={['super_admin', 'admin']}>
                                        <UserManage />
                                    </AuthRoute>
                                } />
                                <Route path="pending" element={
                                    <AuthRoute roles={['super_admin', 'admin']}>
                                        <PendingReview />
                                    </AuthRoute>
                                } />
                            </Route>

                            {/* 404 */}
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </PageCacheProvider>
                </AuthProvider>
            </BrowserRouter>
        </ConfigProvider>
    );
};

const App: React.FC = () => {
    return (
        <ThemeProvider>
            <AppInner />
        </ThemeProvider>
    );
};

export default App;
