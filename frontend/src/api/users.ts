import api from './index';
import type {
    ApiResponse, UserListData, UserListItem,
    InvitationCodeListData, InvitationCodeItem,
} from '../types';

export interface RecycleBinItem {
    id: number;
    username: string;
    email: string | null;
    role: string;
    company_name: string | null;
    is_active: boolean;
    invitation_code: string | null;
    invitation_code_level: number | null;
    deleted_at: string | null;
    expires_at: string | null;
    last_login_at: string | null;
    created_at: string | null;
}

export interface RecycleBinData {
    total: number;
    page: number;
    page_size: number;
    items: RecycleBinItem[];
}

export const userApi = {
    /** 用户列表（默认只显示活跃账号） */
    list: (params: {
        page?: number;
        page_size?: number;
        role?: string;
        company_name?: string;
        is_active?: boolean;
        keyword?: string;
    }) =>
        api.get<ApiResponse<UserListData>>('/users', { params }),

    /** 用户详情 */
    getById: (id: number) =>
        api.get<ApiResponse<UserListItem>>(`/users/${id}`),

    /** 删除用户 */
    delete: (id: number) =>
        api.delete<ApiResponse>(`/users/${id}`),

    /** 设置过期时间 */
    updateExpiry: (id: number, data: { expires_at: string | null }) =>
        api.put<ApiResponse>(`/users/${id}/expiry`, data),

    /** 回收站列表 */
    getRecycleBin: (params: {
        page?: number;
        page_size?: number;
    }) =>
        api.get<ApiResponse<RecycleBinData>>('/users/recycle-bin', { params }),

    /** 生成邀请码（公司名称由注册用户自行填写，不再在此指定） */
    generateInvitationCode: (data: {
        level: number;
        expires_at: string;
    }) =>
        api.post<ApiResponse<InvitationCodeItem>>('/invitation-codes/generate', data),

    /** 邀请码列表 */
    getInvitationCodes: (params: {
        page?: number;
        page_size?: number;
        level?: number;
        is_active?: boolean;
    }) =>
        api.get<ApiResponse<InvitationCodeListData>>('/invitation-codes', { params }),

    /** 作废邀请码 */
    deactivateCode: (id: number) =>
        api.delete<ApiResponse>(`/invitation-codes/${id}`),

    /** 邀请码回收站 */
    getCodeRecycleBin: (params: { page?: number; page_size?: number }) =>
        api.get<ApiResponse<any>>('/invitation-codes/recycle-bin', { params }),

    /** 清空回收站 */
    clearRecycleBin: () =>
        api.delete<ApiResponse>('/recycle-bin'),

    /** 设置 API Key */
    updateApiKey: (data: { api_key: string }) =>
        api.put<ApiResponse>('/users/api-key', data),

    /** 获取 API Key 状态 */
    getApiKeyStatus: () =>
        api.get<ApiResponse<{ has_key: boolean; mask: string; total_tokens_spent: number }>>('/users/api-key-status'),

    /** 获取 Token 消耗统计 */
    getTokenUsage: () =>
        api.get<ApiResponse<{ total_tokens: number; daily_usage: { date: string; tokens: number }[] }>>('/users/token-usage'),

    /** 修改当前账号所属公司的数据库密码 */
    updateCompanyPassword: (data: { company_password: string }) =>
        api.put<ApiResponse>('/users/company-password', data),
};
