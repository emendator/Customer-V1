import api from './index';
import type { ApiResponse, PendingScriptListData } from '../types';

export const pendingApi = {
    /** 待审核列表 */
    list: (params: {
        page?: number;
        page_size?: number;
        status?: string;
        action?: string;
    }) =>
        api.get<ApiResponse<PendingScriptListData>>('/pending-scripts', { params }),

    /** 审核通过 */
    approve: (id: number) =>
        api.post<ApiResponse>(`/pending-scripts/${id}/approve`),

    /** 驳回 */
    reject: (id: number, data: { reason: string }) =>
        api.post<ApiResponse>(`/pending-scripts/${id}/reject`, data),
};
