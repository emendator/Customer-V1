import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { message } from 'antd';
import { authApi } from '../api/auth';
import type { UserInfo, LoginRequest, RegisterRequest } from '../types';

interface AuthContextType {
    user: UserInfo | null;
    token: string | null;
    isAuthenticated: boolean;
    loading: boolean;
    login: (data: LoginRequest) => Promise<UserInfo>;
    register: (data: RegisterRequest) => Promise<{ user_id: number; role: string }>;
    guestLogin: () => Promise<UserInfo>;
    logout: () => void;
    completeProfile: (company_name: string, company_password: string, mode?: string) => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    // 初始化时验证 Token
    useEffect(() => {
        const initAuth = async () => {
            const storedToken = localStorage.getItem('token');
            if (storedToken) {
                try {
                    const res = await authApi.getMe();
                    const userData = res.data.data;
                    setUser(userData);
                    setToken(storedToken);
                    localStorage.setItem('user', JSON.stringify(userData));
                } catch {
                    // Token 无效，清除
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    setToken(null);
                    setUser(null);
                }
            }
            setLoading(false);
        };
        initAuth();
    }, []);

    const login = useCallback(async (data: LoginRequest): Promise<UserInfo> => {
        const res = await authApi.login(data);
        const result = res.data.data;
        const userData = result.user;
        localStorage.setItem('token', result.access_token);
        localStorage.setItem('user', JSON.stringify(userData));
        setToken(result.access_token);
        setUser(userData);
        return userData;
    }, []);

    const register = useCallback(async (data: RegisterRequest) => {
        const res = await authApi.register(data);
        return res.data.data;
    }, []);

    const guestLogin = useCallback(async (): Promise<UserInfo> => {
        const res = await authApi.guestLogin();
        const result = res.data.data;
        const userData = result.user;
        localStorage.setItem('token', result.access_token);
        localStorage.setItem('user', JSON.stringify(userData));
        setToken(result.access_token);
        setUser(userData);
        return userData;
    }, []);

    const logout = useCallback(() => {
        // 游客退出：先调用后端清除该游客的全部使用痕迹（话术/分类/日志等）
        if (user?.role === 'guest') {
            authApi.guestLogout().catch(() => { /* 忽略失败，仍清除本地状态 */ });
        }
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        message.success('已退出登录');
    }, [user]);

    const completeProfile = useCallback(async (company_name: string, company_password: string, mode: string = 'auto') => {
        await authApi.completeProfile({ company_name, company_password, mode });
        // 刷新用户信息
        const res = await authApi.getMe();
        const userData = res.data.data;
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const res = await authApi.getMe();
            const userData = res.data.data;
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
        } catch {
            logout();
        }
    }, [logout]);

    return (
        <AuthContext.Provider value={{
            user,
            token,
            isAuthenticated: !!token && !!user,
            loading,
            login,
            register,
            guestLogin,
            logout,
            completeProfile,
            refreshUser,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
