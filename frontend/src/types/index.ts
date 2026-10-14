// ==================== 通用类型 ====================
export interface ApiResponse<T = any> {
    success: boolean;
    data: T;
    message: string;
}

// ==================== 认证 ====================
export interface LoginRequest {
    username: string;
    password: string;
}

export interface RegisterRequest {
    username: string;
    password: string;
    email: string;
    invitation_code: string;
}

export interface UserInfo {
    id: number;
    username: string;
    email: string | null;
    role: 'super_admin' | 'admin' | 'user' | 'guest';
    company_name: string | null;
    is_active: boolean;
    expires_at: string | null;
    last_login_at: string | null;
    created_at: string | null;
    has_api_key: boolean;
    total_tokens_spent: number;
    needs_company: boolean;
}

export interface TokenUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
}

export interface AIAnalyzeResult {
    responses: AIResponseItem[];
    mode: string;
    fallback: boolean;
    fallback_message: string;
    token_usage?: TokenUsage;
}

export interface LoginResult {
    access_token: string;
    token_type: string;
    user: UserInfo;
}

// ==================== 用户管理 ====================
export interface UserListItem {
    id: number;
    username: string;
    email: string | null;
    role: string;
    company_name: string | null;
    is_active: boolean;
    expires_at: string | null;
    last_login_at: string | null;
    created_at: string | null;
}

export interface UserListData {
    total: number;
    page: number;
    page_size: number;
    items: UserListItem[];
}

// ==================== 邀请码 ====================
export interface InvitationCodeItem {
    id: number;
    code: string;
    level: number;
    company_name: string | null;
    created_by: number | null;
    creator_name: string;
    used_by: number | null;
    used_by_name: string | null;
    is_active: boolean;
    expires_at: string | null;
    used_at: string | null;
    created_at: string | null;
}

export interface InvitationCodeListData {
    total: number;
    page: number;
    page_size: number;
    items: InvitationCodeItem[];
}

// ==================== 待审核话术 ====================
export interface PendingScriptItem {
    id: number;
    content: string;
    category_id: number | null;
    keywords: string;
    action: 'create' | 'update';
    target_script_id: number | null;
    submitted_by: number;
    company_name: string | null;
    status: 'pending' | 'approved' | 'rejected';
    reviewed_by: number | null;
    review_reason: string | null;
    created_at: string | null;
    reviewed_at: string | null;
    submitter_name: string | null;
    reviewer_name: string | null;
    category_name: string | null;
}

export interface PendingScriptListData {
    total: number;
    page: number;
    page_size: number;
    items: PendingScriptItem[];
}

// ==================== 分类 ====================
export interface CategoryNode {
    id: number;
    name: string;
    parent_id: number | null;
    sort_order: number;
    is_active: boolean;
    script_count: number;
    children: CategoryNode[];
}

export interface CategoryFlat {
    id: number;
    name: string;
    parent_id: number | null;
    sort_order: number;
}

export interface CategoryCreate {
    name: string;
    parent_id?: number | null;
    sort_order?: number;
}

export interface CategoryUpdate {
    name?: string;
    sort_order?: number;
    is_active?: boolean;
}

// ==================== 话术 ====================
export interface ScriptItem {
    id: number;
    content: string;
    category_id: number | null;
    keywords: string;
    usage_count: number;
    rating_good: number;
    rating_bad: number;
    source: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    category_name: string | null;
    parent_category_name: string | null;
}

export interface ScriptListData {
    total: number;
    page: number;
    page_size: number;
    items: ScriptItem[];
}

export interface ScriptCreate {
    content: string;
    category_id?: number | null;
    keywords?: string;
    source?: string;
}

export interface ScriptUpdate {
    content?: string;
    category_id?: number | null;
    keywords?: string;
    is_active?: boolean;
}

// ==================== 分析 ====================
export interface AnalyzeRequest {
    query: string;
    category_id?: number | null;
}

export interface ScriptMatch {
    script_id: number;
    content: string;
    score: number;
    category_name: string | null;
    keywords: string;
    usage_count: number;
    source: string;
}

export interface AnalyzeResult {
    matches: ScriptMatch[];
    mode: string;
    query_keywords: string[];
}

export interface AIResponseItem {
    content: string;
    angle: string;
    tone: string;
}

// ==================== 反馈 ====================
export interface FeedbackRequest {
    script_id?: number | null;
    content?: string | null;
    category_id?: number | null;
    query?: string | null;
    mode: string;
    rating?: number | null;
}

// ==================== 导入导出 ====================
export interface ExcelPreview {
    headers: string[];
    preview_rows: Record<string, string>[];
    total_rows: number;
    filename: string;
}

export interface ImportRequest {
    filename: string;
    column_mapping: Record<string, string>;
    strategy: string;
}

export interface ImportResult {
    success_count: number;
    fail_count: number;
    errors: string[];
}
