import api from './index';
import type {
    ApiResponse, CategoryNode, CategoryFlat, CategoryCreate, CategoryUpdate,
} from '../types';

export const categoryApi = {
    /** 获取分类树 */
    getTree: () =>
        api.get<ApiResponse<CategoryNode[]>>('/categories'),

    /** 获取扁平分类列表 */
    getFlat: () =>
        api.get<ApiResponse<CategoryFlat[]>>('/categories/flat'),

    /** 创建分类 */
    create: (data: { name: string; parent_id?: number | null; sort_order?: number }) =>
        api.post<ApiResponse>('/categories', data),

    /** 更新分类 */
    update: (id: number, data: { name?: string; sort_order?: number; is_active?: boolean }) =>
        api.put<ApiResponse>(`/categories/${id}`, data),

    /** 删除分类 */
    delete: (id: number) =>
        api.delete<ApiResponse>(`/categories/${id}`),
};
