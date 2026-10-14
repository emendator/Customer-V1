import api from './index';
import type { ApiResponse, LoginResult, LoginRequest, RegisterRequest, UserInfo } from '../types';

export const authApi = {
    /** 登录 */
    login: (data: LoginRequest) =>
        api.post<ApiResponse<LoginResult>>('/auth/login', data),

    /** 注册 */
    register: (data: RegisterRequest) =>
        api.post<ApiResponse<{ user_id: number; role: string }>>('/auth/register', data),

    /** 完善公司信息（公司名称 + 公司数据库密码；mode: create=新注册公司 / join=登录公司 / auto=自动） */
    completeProfile: (data: { company_name: string; company_password: string; mode?: string }) =>
        api.post<ApiResponse>('/auth/complete-profile', data),

    /** 游客登录（创建一次性游客账号，退出后清除全部使用痕迹） */
    guestLogin: () =>
        api.post<ApiResponse<LoginResult>>('/auth/guest-login'),

    /** 游客退出登录（自动清除该游客的全部使用痕迹） */
    guestLogout: () =>
        api.post<ApiResponse>('/auth/guest-logout'),

    /** 获取当前用户信息 */
    getMe: () =>
        api.get<ApiResponse<UserInfo>>('/auth/me'),
};
