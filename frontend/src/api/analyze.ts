import api from './index';
import type {
    ApiResponse, AnalyzeRequest, AnalyzeResult, AIAnalyzeResult, FeedbackRequest,
} from '../types';

export const analyzeApi = {
    /** 本地匹配 */
    local: (data: AnalyzeRequest) =>
        api.post<ApiResponse<AnalyzeResult>>('/analyze/local', data),

    /** AI 分析 */
    ai: (data: AnalyzeRequest) =>
        api.post<ApiResponse<AIAnalyzeResult>>('/analyze/ai', data),

    /** 官方流程话术 */
    official: (data: { query: string; sub_category: string; matched_scenario: string }) =>
        api.post<ApiResponse<AIAnalyzeResult & { sub_category: string }>>('/analyze/official', data),

    /** 提交反馈 */
    feedback: (data: FeedbackRequest) =>
        api.post<ApiResponse>('/analyze/feedback', data),
};
