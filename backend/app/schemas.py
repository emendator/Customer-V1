from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ==================== 通用 ====================
class ApiResponse(BaseModel):
    success: bool = True
    data: Optional[object] = None
    message: str = ""


# ==================== 认证 ====================
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50, pattern=r'^[a-zA-Z0-9_\u4e00-\u9fa5]+$')
    password: str = Field(..., min_length=6, max_length=128)
    email: str = Field(..., max_length=100)
    invitation_code: str = Field(..., min_length=1, max_length=64)


class CompleteProfileRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=200)
    company_password: str = Field(..., min_length=1, max_length=128, description="公司数据库密码（由公司管理员创建/修改，用于公司级数据隔离）")
    mode: str = Field("auto", description="create=新注册公司 / join=登录公司 / auto=自动判断")


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserInfoResponse"


class UserInfoResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: str
    company_name: Optional[str] = None
    is_active: bool
    expires_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    has_api_key: bool = False
    total_tokens_spent: int = 0
    needs_company: bool = False  # 是否待完善公司名称（注册后由用户自行填写）

    class Config:
        from_attributes = True


# ==================== 用户管理 ====================
class UserListItem(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: str
    company_name: Optional[str] = None
    is_active: bool
    expires_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[UserListItem]


class UserExpiryUpdate(BaseModel):
    expires_at: Optional[datetime] = None


# ==================== 公司数据库密码 ====================
class CompanyPasswordUpdateRequest(BaseModel):
    company_password: str = Field(..., min_length=1, max_length=128, description="新的公司数据库密码（仅可修改当前账号所属公司）")


# ==================== 邀请码 ====================
class InvitationCodeGenerateRequest(BaseModel):
    level: int = Field(..., ge=1, le=2, description="1=一级(管理员), 2=二级(用户)")
    expires_at: datetime = Field(..., description="过期时间")
    # 注：公司名称不再由创建者指定，注册后由用户自行填写


class InvitationCodeResponse(BaseModel):
    id: int
    code: str
    level: int
    company_name: Optional[str] = None
    created_by: Optional[int] = None
    used_by: Optional[int] = None
    is_active: bool
    expires_at: Optional[datetime] = None
    used_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== 待审核话术 ====================
class PendingScriptResponse(BaseModel):
    id: int
    content: str
    category_id: Optional[int] = None
    keywords: str = ""
    action: str
    target_script_id: Optional[int] = None
    submitted_by: int
    company_name: Optional[str] = None
    status: str
    reviewed_by: Optional[int] = None
    review_reason: Optional[str] = None
    created_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    submitter_name: Optional[str] = None
    reviewer_name: Optional[str] = None
    category_name: Optional[str] = None

    class Config:
        from_attributes = True


class PendingScriptListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[PendingScriptResponse]


class ReviewRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500, description="驳回原因")


class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


# ==================== 分类 ====================
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    parent_id: Optional[int] = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None
    sort_order: int
    is_active: bool
    script_count: int = 0
    children: List["CategoryResponse"] = []

    class Config:
        from_attributes = True


# ==================== 话术 ====================
class ScriptCreate(BaseModel):
    content: str = Field(..., min_length=1)
    category_id: Optional[int] = None
    keywords: str = ""
    source: str = "manual"


class ScriptBatchCreate(BaseModel):
    items: List[ScriptCreate]


class ScriptUpdate(BaseModel):
    content: Optional[str] = None
    category_id: Optional[int] = None
    keywords: Optional[str] = None
    is_active: Optional[bool] = None


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ApiKeyUpdateRequest(BaseModel):
    api_key: str = Field(..., min_length=1, max_length=512)


class ScriptResponse(BaseModel):
    id: int
    content: str
    category_id: Optional[int] = None
    keywords: str
    usage_count: int
    rating_good: int
    rating_bad: int
    source: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    category_name: Optional[str] = None
    parent_category_name: Optional[str] = None

    class Config:
        from_attributes = True


class ScriptListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[ScriptResponse]


class ScriptSearchParams(BaseModel):
    keyword: Optional[str] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


# ==================== 分析 ====================
class AnalyzeRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    category_id: Optional[int] = None


class ScriptMatch(BaseModel):
    script_id: int
    content: str
    score: float
    category_name: Optional[str] = None
    keywords: str = ""
    usage_count: int = 0
    source: str = ""


class AnalyzeResponse(BaseModel):
    matches: List[ScriptMatch]
    mode: str = "local"
    query_keywords: List[str] = []


class AIResponseItem(BaseModel):
    content: str
    angle: str = ""
    tone: str = ""


class AIAnalyzeResponse(BaseModel):
    responses: List[AIResponseItem]
    mode: str = "ai"
    fallback: bool = False
    fallback_message: str = ""


# ==================== 官方流程话术 ====================
class OfficialScriptRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000, description="客户原始输入/问题描述")
    sub_category: str = Field(..., description="要生成的子分类名称")
    matched_scenario: str = Field("", description="AI分析出的匹配场景说明")


# ==================== 反馈 ====================
class FeedbackRequest(BaseModel):
    script_id: Optional[int] = None
    content: Optional[str] = None
    category_id: Optional[int] = None
    query: Optional[str] = None
    mode: str = "local"
    rating: Optional[int] = None  # 1=好评, 0=差评


# ==================== 导入导出 ====================
class ExcelPreviewResponse(BaseModel):
    headers: List[str]
    preview_rows: List[dict]
    total_rows: int
    filename: str


class ImportRequest(BaseModel):
    filename: str
    column_mapping: dict  # {"content": "话术内容列", "category_name": "分类列", ...}
    strategy: str = "append"  # append / dedup


class ImportResultResponse(BaseModel):
    success_count: int
    fail_count: int
    errors: List[str] = []
