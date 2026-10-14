import api from './index';
import type { ApiResponse, ExcelPreview, ImportRequest, ImportResult } from '../types';

export const uploadApi = {
    /** 上传 Excel 预览 */
    uploadExcel: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post<ApiResponse<ExcelPreview>>('/upload/excel', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },

    /** 确认导入 */
    importData: (data: ImportRequest) =>
        api.post<ApiResponse<ImportResult>>('/upload/import', data),

    /** 导出话术 */
    exportScripts: (params?: { category_id?: number; keyword?: string; script_ids?: string }) =>
        api.get('/export/scripts', { params, responseType: 'blob' }),

    /** 下载模板 */
    downloadTemplate: () =>
        api.get('/export/template', { responseType: 'blob' }),
};
