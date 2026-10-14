# 智能客服话术库系统 — 用户认证与权限体系 · 实施步骤

> 版本: v1.0  
> 更新日期: 2026-07-24  
> 预计工时: 3~4 天  
> 前置条件: 现有系统（v1.0）功能完整可用

---

## 实施总览

```
智能客服/
├── backend/app/
│   ├── main.py                    ← 修改：注册新路由、CORS
│   ├── models.py                  ← 修改：新增 User/InvitationCode/PendingScript 模型
│   ├── schemas.py                 ← 修改：新增认证/权限相关 Schema
│   ├── auth.py                    ← 🆕 JWT 生成与验证、密码工具、依赖注入
│   ├── routers/
│   │   ├── auth.py                ← 🆕 登录/注册/公司信息补充
│   │   ├── users.py               ← 🆕 用户管理（CRUD + 邀请码管理）
│   │   ├── pending.py             ← 🆕 审核管理
│   │   └── scripts.py             ← 修改：增加权限判断/审核流程
│   └── crud/
│       ├── user.py                ← 🆕 用户 CRUD
│       ├── invitation_code.py     ← 🆕 邀请码 CRUD
│       └── pending_script.py      ← 🆕 待审核话术 CRUD
├── frontend/src/
│   ├── api/
│   │   ├── auth.ts                ← 🆕 认证相关 API
│   │   ├── users.ts               ← 🆕 用户管理 API
│   │   ├── pending.ts             ← 🆕 审核管理 API
│   │   └── index.ts               ← 修改：增加 Token 拦截器
│   ├── components/
│   │   ├── AuthRoute.tsx           ← 🆕 路由守卫组件
│   │   ├── PermissionGuard.tsx    ← 🆕 权限控制组件
│   │   └── Layout.tsx             ← 修改：增加用户信息/退出
│   ├── pages/
│   │   ├── Login.tsx              ← 🆕 登录页
│   │   ├── Register.tsx           ← 🆕 注册页
│   │   ├── CompleteProfile.tsx    ← 🆕 公司信息补充页
│   │   ├── UserManage.tsx         ← 🆕 用户管理页
│   │   ├── PendingReview.tsx      ← 🆕 审核管理页
│   │   ├── ScriptManage.tsx       ← 修改：角色权限适配
│   │   └── CategoryManage.tsx     ← 修改：角色权限适配
│   ├── types/
│   │   └── index.ts               ← 修改：新增用户/权限相关类型
│   ├── context/
│   │   └── AuthContext.tsx         ← 🆕 用户认证上下文
│   └── App.tsx                    ← 修改：路由重组+守卫
└── backend/init_db.py             ← 修改：创建默认 super_admin 账号
```

---

## 第一阶段：后端认证基础（预计 1 天）

### Step 1.1：安装依赖

在 `backend/requirements.txt` 中增加：

```
python-jose[cryptography]==3.3.0   # JWT 生成与验证
passlib[bcrypt]==1.7.4             # 密码加密
bcrypt==4.0.1                      # bcrypt 算法
```

### Step 1.2：创建 auth.py — JWT 与密码工具

**文件**: `backend/app/auth.py`

**功能**:

- `pwd_context = CryptContext(schemes=["bcrypt"])`
- `verify_password(plain, hashed)` → bool
- `get_password_hash(password)` → str
- `create_access_token(data, expires_delta)` → JWT str
- `get_current_user(token, db)` → User（FastAPI 依赖注入）
- `require_role(...)` → 权限校验依赖

**JWT 配置**（放在 config.py 中）:

```python
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 小时
```

### Step 1.3：新增数据模型

**文件**: `backend/app/models.py`

新增三个模型类：

1. **`User`** — 用户表

   ```python
   class User(Base):
       __tablename__ = "users"
       id = Column(Integer, primary_key=True)
       username = Column(String(50), unique=True, nullable=False, index=True)
       password_hash = Column(String(255), nullable=False)
       email = Column(String(100))
       role = Column(String(20), default="user")  # super_admin / admin / user
       company_name = Column(String(200))
       invitation_code_id = Column(Integer, ForeignKey("invitation_codes.id"), nullable=True)
       is_active = Column(Boolean, default=True)
       expires_at = Column(DateTime, nullable=True)
       last_login_at = Column(DateTime, nullable=True)
       created_at = Column(DateTime, default=datetime.now)
       updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
   ```

2. **`InvitationCode`** — 邀请码表

   ```python
   class InvitationCode(Base):
       __tablename__ = "invitation_codes"
       id = Column(Integer, primary_key=True)
       code = Column(String(64), unique=True, nullable=False, index=True)
       level = Column(Integer, nullable=False)  # 1=admin, 2=user
       company_name = Column(String(200))
       created_by = Column(Integer, ForeignKey("users.id"))
       used_by = Column(Integer, ForeignKey("users.id"), nullable=True)
       is_active = Column(Boolean, default=True)
       expires_at = Column(DateTime, nullable=False)
       used_at = Column(DateTime, nullable=True)
       created_at = Column(DateTime, default=datetime.now)
   ```

3. **`PendingScript`** — 待审核话术表

   ```python
   class PendingScript(Base):
       __tablename__ = "pending_scripts"
       id = Column(Integer, primary_key=True)
       content = Column(Text, nullable=False)
       category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
       keywords = Column(String(500), default="")
       action = Column(String(20), nullable=False)  # create / update
       target_script_id = Column(Integer, ForeignKey("scripts.id"), nullable=True)
       submitted_by = Column(Integer, ForeignKey("users.id"), nullable=False)
       company_name = Column(String(200))
       status = Column(String(20), default="pending")  # pending / approved / rejected
       reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
       review_reason = Column(Text, nullable=True)
       created_at = Column(DateTime, default=datetime.now)
       reviewed_at = Column(DateTime, nullable=True)
   ```

**修改现有模型**:

- `Script` 表增加 `company_name` 字段
- `Category` 表增加 `company_name` 字段

### Step 1.4：新增 Pydantic Schema

**文件**: `backend/app/schemas.py`

新增 Schema 类：

```
# 认证
LoginRequest, RegisterRequest, CompleteProfileRequest
LoginResponse, UserInfo

# 用户管理
UserResponse, UserListResponse, UserUpdateRequest

# 邀请码
InvitationCodeGenerateRequest, InvitationCodeResponse, InvitationCodeListResponse

# 审核
PendingScriptResponse, PendingScriptListResponse, ReviewRequest
```

### Step 1.5：新增 CRUD 层

1. **`backend/app/crud/user.py`**:
   - `get_user_by_id`, `get_user_by_username`
   - `create_user`, `update_user`, `delete_user`
   - `get_users_by_company`（获取同公司所有用户）
   - `get_users_paginated`（分页查询，支持角色/公司筛选）
   - `update_last_login`
   - `cascade_delete_admin`（级联删除管理员及其旗下所有用户）

2. **`backend/app/crud/invitation_code.py`**:
   - `generate_code`（生成唯一邀请码）
   - `get_code_by_code_str`（按邀请码字符串查询）
   - `validate_and_use_code`（验证+标记已使用，事务保证）
   - `get_codes_by_creator`（创建者查询自己的邀请码）
   - `get_codes_paginated`（分页查询）
   - `deactivate_code`（作废邀请码）

3. **`backend/app/crud/pending_script.py`**:
   - `create_pending`, `get_pending_by_id`
   - `get_pending_by_company`（按公司获取待审核列表）
   - `approve_pending`（审核通过 → 写入 scripts 表）
   - `reject_pending`（驳回，填写原因）

### Step 1.6：新增路由

1. **`backend/app/routers/auth.py`**:

   | 方法 | 路径 | 说明 |
   |------|------|------|
   | POST | `/api/auth/login` | 登录验证，返回 Token + 用户信息 |
   | POST | `/api/auth/register` | 注册，验证邀请码 |
   | POST | `/api/auth/complete-profile` | 补充公司名称 |
   | GET | `/api/auth/me` | 获取当前用户信息 |

2. **`backend/app/routers/users.py`**:

   | 方法 | 路径 | 说明 |
   |------|------|------|
   | GET | `/api/users` | 用户列表（分页+筛选） |
   | GET | `/api/users/{id}` | 用户详情 |
   | DELETE | `/api/users/{id}` | 删除用户（含级联） |
   | PUT | `/api/users/{id}/expiry` | 修改过期时间 |
   | POST | `/api/invitation-codes/generate` | 生成邀请码 |
   | GET | `/api/invitation-codes` | 邀请码列表 |
   | DELETE | `/api/invitation-codes/{id}` | 作废邀请码 |

3. **`backend/app/routers/pending.py`**:

   | 方法 | 路径 | 说明 |
   |------|------|------|
   | GET | `/api/pending-scripts` | 待审核列表 |
   | POST | `/api/pending-scripts/{id}/approve` | 通过 |
   | POST | `/api/pending-scripts/{id}/reject` | 驳回 |

### Step 1.7：修改 main.py 注册新路由

```python
from .routers import auth, users, pending

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(pending.router)
```

### Step 1.8：修改现有路由增加权限控制

**`backend/app/routers/scripts.py`**:

- 所有接口增加 `get_current_user` 依赖
- 增加 `company_name` 过滤
- user 角色的 POST/PUT 改为写入 pending_scripts 表
- user 角色的 DELETE 返回 403

**`backend/app/routers/categories.py`**:

- 所有接口增加 `get_current_user` 依赖
- 增加 `company_name` 过滤
- user 角色的 POST/PUT/DELETE 返回 403

### Step 1.9：修改 init_db.py

在初始化数据库中：

1. 创建默认 super_admin 用户（用户名见 app/config.py，初始口令来自 .env 的 SUPER_ADMIN_PASSWORD）
2. 设置 company_name = "我的公司"
3. 确保数据表创建顺序正确

---

## 第二阶段：前端认证基础（预计 1 天）

### Step 2.1：前端依赖

无需额外 npm 包，现有依赖（axios, react-router-dom, antd）足够。

### Step 2.2：创建 AuthContext

**文件**: `frontend/src/context/AuthContext.tsx`

功能：

- `AuthProvider` 包裹整个应用
- 提供全局状态: `user`, `token`, `isAuthenticated`, `loading`
- 提供方法: `login()`, `register()`, `logout()`, `completeProfile()`
- 初始化时从 localStorage 读取 Token 并验证
- Token 过期自动清除

### Step 2.3：修改 Axios 实例

**文件**: `frontend/src/api/index.ts`

修改请求拦截器：

```typescript
// 请求拦截：自动携带 Token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 响应拦截：401 自动跳转登录
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);
```

### Step 2.4：新增 API 文件

1. **`frontend/src/api/auth.ts`**:

   ```typescript
   export const authApi = {
       login: (data: LoginRequest) => api.post('/api/auth/login', data),
       register: (data: RegisterRequest) => api.post('/api/auth/register', data),
       completeProfile: (data: { company_name: string }) => api.post('/api/auth/complete-profile', data),
       getMe: () => api.get('/api/auth/me'),
   };
   ```

2. **`frontend/src/api/users.ts`**:

   ```typescript
   export const userApi = {
       list: (params) => api.get('/api/users', { params }),
       getById: (id) => api.get(`/api/users/${id}`),
       delete: (id) => api.delete(`/api/users/${id}`),
       updateExpiry: (id, data) => api.put(`/api/users/${id}/expiry`, data),
       generateInvitationCode: (data) => api.post('/api/invitation-codes/generate', data),
       getInvitationCodes: (params) => api.get('/api/invitation-codes', { params }),
       deactivateCode: (id) => api.delete(`/api/invitation-codes/${id}`),
   };
   ```

3. **`frontend/src/api/pending.ts`**:

   ```typescript
   export const pendingApi = {
       list: (params) => api.get('/api/pending-scripts', { params }),
       approve: (id) => api.post(`/api/pending-scripts/${id}/approve`),
       reject: (id, reason) => api.post(`/api/pending-scripts/${id}/reject`, { reason }),
   };
   ```

### Step 2.5：创建路由守卫

**文件**: `frontend/src/components/AuthRoute.tsx`

```typescript
// 根据角色权限控制路由访问
const AuthRoute: React.FC<{ children; roles?: string[] }> = ({ children, roles }) => {
    const { user, isAuthenticated, loading } = useAuth();

    if (loading) return <Spin fullscreen />;
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    if (roles && user && !roles.includes(user.role)) {
        return <Result status="403" title="403" subTitle="抱歉，您没有权限访问此页面" />;
    }
    return children;
};
```

### Step 2.6：创建登录页

**文件**: `frontend/src/pages/Login.tsx`

UI 设计要点：

```
┌─────────────────────────────────────┐
│         💬 智能客服话术库系统         │
│                                     │
│  ┌─────────────────────────────┐    │
│  │       欢迎回来               │    │
│  │                             │    │
│  │  👤 用户名                  │    │
│  │  [________________________] │    │
│  │                             │    │
│  │  🔒 密码                   │    │
│  │  [________________________] │    │
│  │                             │    │
│  │  [    登  录    ]           │    │
│  │                             │    │
│  │  没有账号？立即注册 →        │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

视觉风格：

- 全屏居中，背景使用渐变色（#667eea → #764ba2 或类似商务蓝紫渐变）
- 卡片白色背景，圆角阴影
- 品牌名在卡片上方或左侧
- 简洁的 Ant Design 表单，无多余装饰
- 输入框带图标前缀

### Step 2.7：创建注册页

**文件**: `frontend/src/pages/Register.tsx`

与登录页统一风格，表单字段：

- 用户名（含格式校验）
- 邮箱（含格式校验）
- 密码（含强度提示）
- 确认密码
- 邀请码

### Step 2.8：创建公司信息补充页

**文件**: `frontend/src/pages/CompleteProfile.tsx`

- 简单的单字段页面：公司名称
- 如果角色是 admin（一级邀请码注册），必须填写公司名称
- 如果角色是 user（二级邀请码注册），公司名称继承自动填充，只读展示
- 提交后跳转到工作台主页

### Step 2.9：修改 Layout 组件

**文件**: `frontend/src/components/Layout.tsx`

修改点：

1. 顶部 Header 右侧增加用户信息区域：
   - 用户头像（Ant Design Avatar）
   - 用户名
   - 角色标签（带颜色区分：金色=super_admin, 蓝色=admin, 灰色=user）
   - 退出登录按钮
2. 侧边栏根据角色动态显示菜单项：
   - super_admin/admin 显示「用户管理」和「审核管理」菜单
   - user 隐藏这两个菜单
3. 如果公司名称存在，在侧边栏底部显示

### Step 2.10：修改 App.tsx 路由

```typescript
<Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/complete-profile" element={<AuthRoute><CompleteProfile /></AuthRoute>} />
    <Route path="/" element={<AuthRoute><AppLayout /></AuthRoute>}>
        <Route index element={<Navigate to="/workbench" />} />
        <Route path="workbench" element={<Workbench />} />
        <Route path="scripts" element={<ScriptManage />} />
        <Route path="categories" element={<AuthRoute roles={['super_admin','admin']}><CategoryManage /></AuthRoute>} />
        <Route path="import-export" element={<ImportExport />} />
        <Route path="users" element={<AuthRoute roles={['super_admin','admin']}><UserManage /></AuthRoute>} />
        <Route path="pending" element={<AuthRoute roles={['super_admin','admin']}><PendingReview /></AuthRoute>} />
    </Route>
</Routes>
```

---

## 第三阶段：权限控制与页面适配（预计 1 天）

### Step 3.1：修改话术管理页面

**文件**: `frontend/src/pages/ScriptManage.tsx`

修改点：

- 获取当前用户角色
- **user 角色**:
  - 隐藏「删除」按钮和「批量删除」操作
  - 「新增」按钮文字改为「提交审核」
  - 「编辑」按钮文字改为「申请修改」
  - 操作提交后显示「已提交审核，等待管理员批准」
- **admin/super_admin 角色**:
  - 显示「待审核」入口（右上角 badge 显示待审核数量）
  - 完整 CRUD 操作不变

### Step 3.2：修改分类管理页面

**文件**: `frontend/src/pages/CategoryManage.tsx`

修改点：

- user 角色：隐藏所有增删改操作按钮，仅展示树形列表（只读模式）
- admin/super_admin：保持不变

### Step 3.3：创建用户管理页面

**文件**: `frontend/src/pages/UserManage.tsx`

功能：

1. **用户列表 Tab**:
   - Ant Design Table
   - 列：用户名、角色（Tag）、公司、邮箱、注册时间、最后登录、过期时间、状态、操作
   - 筛选：按角色、公司、状态
   - 操作：删除（超管可删管理员，管理员可删用户）、设置过期时间
   - 级联删除二次确认弹窗

2. **邀请码管理 Tab**:
   - Ant Design Table
   - 列：邀请码、等级、关联公司、创建时间、过期时间、状态（未使用/已使用/已过期/已作废）、使用人
   - 操作：生成新邀请码（Modal 表单，选择等级+过期时间）
   - 作废未使用的邀请码
   - super_admin 可生成一级和二级，admin 只能生成二级

### Step 3.4：创建审核管理页面

**文件**: `frontend/src/pages/PendingReview.tsx`

功能：

- Ant Design Table 展示待审核话术
- 列：话术内容、操作类型（新增/编辑）、原话术（编辑时）、提交人、提交时间、操作
- 操作：通过 / 驳回（驳回时弹出输入框填写原因）
- 筛选：按操作类型、状态
- 已审核的历史记录可查看（通过/驳回）

---

## 第四阶段：数据初始化与测试（预计 0.5 天）

### Step 4.1：更新 init_db.py

初始化脚本增加：

1. 创建 users 表、invitation_codes 表、pending_scripts 表
2. 创建默认 super_admin 用户：
   - username: admin
   - password: 初始口令（来自 .env 的 SUPER_ADMIN_PASSWORD，bcrypt 加密）
   - role: super_admin
   - company_name: 我的公司
   - is_active: True
   - expires_at: NULL（永不过期）
3. 确保原话术数据兼容（company_name 默认值处理）

### Step 4.2：数据迁移

针对已有的话术数据：

- 现有的 scripts 数据设置 company_name = "我的公司"（默认迁移到超管公司）
- 后续通过邀请码注册的账号自动关联公司

### Step 4.3：后端 API 测试清单

- [ ] 登录：正确/错误密码
- [ ] 注册：有效/无效邀请码
- [ ] 注册：邀请码过期/已使用
- [ ] 注册：用户名重复
- [ ] 注册：邮箱格式校验
- [ ] Token 验证：有效/过期/伪造
- [ ] 角色权限：越权访问 403
- [ ] 邀请码生成：超管一级/二级，管理员仅二级
- [ ] 用户管理：列表/删除/级联删除
- [ ] 审核流程：提交/通过/驳回
- [ ] 公司隔离：A公司看不到B公司的数据
- [ ] 账号过期检测

### Step 4.4：前端功能测试清单

- [ ] 登录页展示/交互
- [ ] 注册页展示/交互
- [ ] 自动登录（刷新后保持状态）
- [ ] 路由守卫：未登录跳转
- [ ] 权限守卫：无权限页 403
- [ ] 用户管理页：列表/生成码/删除
- [ ] 审核管理页：列表/通过/驳回
- [ ] user 角色话术页：隐藏删除/提交审核
- [ ] 退出登录

---

## 五、关键代码示例

### 5.1 JWT 工具（auth.py 核心）

```python
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from .database import get_db
from .models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """验证 Token 并返回当前用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise credentials_exception

    # 检查账号是否过期
    if user.expires_at and datetime.utcnow() > user.expires_at:
        raise HTTPException(status_code=403, detail="账号已过期，请联系管理员")

    return user

def require_role(*roles: str):
    """角色权限校验依赖"""
    async def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足"
            )
        return current_user
    return role_checker
```

### 5.2 邀请码生成（邀请码 CRUD 核心）

```python
import uuid
import secrets

def generate_unique_code() -> str:
    """生成唯一邀请码（8位字母数字组合，可读性好）"""
    return secrets.token_hex(4).upper()  # 8字符十六进制

def create_invitation_code(
    db: Session,
    level: int,
    company_name: str,
    created_by: int,
    expires_at: datetime,
) -> InvitationCode:
    code_str = generate_unique_code()
    # 保证唯一性（极小概率碰撞）
    while db.query(InvitationCode).filter(InvitationCode.code == code_str).first():
        code_str = generate_unique_code()

    code = InvitationCode(
        code=code_str,
        level=level,
        company_name=company_name,
        created_by=created_by,
        expires_at=expires_at,
    )
    db.add(code)
    db.commit()
    db.refresh(code)
    return code

def validate_and_use_code(db: Session, code_str: str) -> InvitationCode:
    """验证邀请码有效性，使用后标记为已用（事务安全）"""
    code = db.query(InvitationCode).filter(
        InvitationCode.code == code_str,
        InvitationCode.is_active == True,
        InvitationCode.used_by == None,
    ).with_for_update().first()

    if not code:
        raise HTTPException(status_code=400, detail="邀请码无效或已被使用")

    if code.expires_at and datetime.utcnow() > code.expires_at:
        raise HTTPException(status_code=400, detail="邀请码已过期")

    code.used_by = user_id  # 设置使用者
    code.used_at = datetime.utcnow()
    db.commit()
    return code
```

### 5.3 审核通过事务（审核 CRUD 核心）

```python
def approve_pending(db: Session, pending_id: int, reviewer_id: int) -> Script:
    """审核通过：将待审核话术写入正式话术库"""
    pending = db.query(PendingScript).filter(
        PendingScript.id == pending_id,
        PendingScript.status == "pending",
    ).first()
    if not pending:
        raise HTTPException(status_code=404, detail="待审核记录不存在")

    if pending.action == "create":
        script = Script(
            content=pending.content,
            category_id=pending.category_id,
            keywords=pending.keywords,
            company_name=pending.company_name,
            source="manual",
        )
        db.add(script)
    elif pending.action == "update":
        script = db.query(Script).filter(Script.id == pending.target_script_id).first()
        if not script:
            raise HTTPException(status_code=404, detail="原话术不存在")
        script.content = pending.content
        script.category_id = pending.category_id
        script.keywords = pending.keywords

    pending.status = "approved"
    pending.reviewed_by = reviewer_id
    pending.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(script)
    return script
```

---

## 六、注意事项

### 6.1 兼容性

- 现有话术数据默认公司为 "我的公司"
- 旧版 API 调用者不受影响（新增 Token 校验为非强制模式过渡）
- 前端新旧路由兼容，登录页面不影响已有工作台功能

### 6.2 安全要点

- SECRET_KEY 必须从环境变量读取，不可硬编码
- 密码绝不记录日志
- 邀请码使用 `secrets` 模块生成（非 random）
- 所有用户输入做长度和格式校验
- API 层面防暴力破解（登录失败次数限制可后续增加）

### 6.3 数据一致性

- 级联删除使用应用层事务（begin/commit/rollback）
- 邀请码使用 `SELECT ... FOR UPDATE` 行级锁防止并发使用
- 公司名称关联使用字符串而非外键（简单灵活，适用 SQLite）

### 6.4 性能考量

- Token 验证仅 JWT 解码，无数据库查询（除非需要最新用户信息）
- 邀请码生成复杂度 O(1)
- 公司隔离使用索引字段过滤（company_name 建索引）

---

## 七、实施顺序建议

```
第1天 → 第一阶段（后端认证基础）
    上午：Step 1.1 ~ 1.4（配置、模型、Schema、auth.py）
    下午：Step 1.5 ~ 1.9（CRUD、路由、修改 main.py 和 init_db.py）

第2天 → 第二阶段（前端认证基础）
    上午：Step 2.1 ~ 2.5（AuthContext、API、路由守卫）
    下午：Step 2.6 ~ 2.10（登录页、注册页、Layout、App.tsx）

第3天 → 第三阶段 + 第四阶段（权限适配 + 测试）
    上午：Step 3.1 ~ 3.4（页面权限适配）
    下午：Step 4.1 ~ 4.4（数据初始化、测试）
```
