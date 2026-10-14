import api from './index';
import type { ApiResponse, ScriptListData, ScriptItem, ScriptCreate, ScriptUpdate } from '../types';

export const scriptApi = {
    /** 话术列表 */
    list: (params: {
        keyword?: string;
        category_id?: number | null;
        is_active?: boolean;
        page?: number;
        page_size?: number;
    }) =>
        api.get<ApiResponse<ScriptListData>>('/scripts', { params }),

    /** 话术详情 */
    get: (id: number) =>
        api.get<ApiResponse<ScriptItem>>(`/scripts/${id}`),

    /** 创建话术 */
    create: (data: ScriptCreate) =>
        api.post<ApiResponse>('/scripts', data),

    /** 批量创建 */
    batchCreate: (items: ScriptCreate[]) =>
        api.post<ApiResponse>('/scripts/batch', { items }),

    /** 更新话术 */
    update: (id: number, data: ScriptUpdate) =>
        api.put<ApiResponse>(`/scripts/${id}`, data),

    /** 切换启用状态 */
    toggle: (id: number) =>
        api.put<ApiResponse>(`/scripts/${id}/toggle`),

    /** 删除话术 */
    delete: (id: number) =>
        api.delete<ApiResponse>(`/scripts/${id}`),

    /** 批量删除 */
    batchDelete: (ids: number[]) =>
        api.post<ApiResponse>('/scripts/batch-delete', ids),
};
