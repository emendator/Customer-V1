# 智能客服话术库系统 — 用户认证与权限体系 · 需求分析文档

> 版本: v1.0  
> 更新日期: 2026-07-24  
> 关联文档: `requirements-analysis.md`（原需求分析）、`auth-implementation-plan.md`（本模块实施步骤）

---

## 一、需求概述

为现有智能客服话术库系统增加 **用户认证（登录/注册）与三级权限体系**，实现不同角色的功能隔离和数据安全管控。

---

## 二、用户角色与权限矩阵

### 2.1 三级角色

| 角色 | 英文标识 | 等级 | 说明 |
|------|----------|------|------|
| **最高级管理员** | `super_admin` | 3 | 系统超级管理员，内置账户 admin，唯一 |
| **管理员** | `admin` | 2 | 由 super_admin 通过一级邀请码分发创建 |
| **普通用户** | `user` | 1 | 由 super_admin 或 admin 通过二级邀请码分发创建 |

### 2.2 权限矩阵

| 功能模块 | super_admin | admin | user |
|----------|:-----------:|:-----:|:----:|
| **话术库-查看** | ✅ | ✅ | ✅ |
| **话术库-新增** | ✅ | ✅ | ⚠️ 需审核 |
| **话术库-编辑** | ✅ | ✅ | ⚠️ 需审核 |
| **话术库-删除** | ✅ | ✅ | ❌ |
| **分类管理** | ✅ | ✅ | ❌ |
| **用户管理** | ✅ | ✅（仅管理下属用户） | ❌ |
| **分发一级邀请码** | ✅ | ❌ | ❌ |
| **分发二级邀请码** | ✅ | ✅ | ❌ |
| **审核用户增改请求** | ✅ | ✅ | ❌ |
| **清除过期账号** | ✅ | ✅（仅用户） | ❌ |
| **查看审核请求** | ✅ | ✅ | ❌ |

---

## 三、功能详细需求

### 3.1 登录功能

- **路径**: `/login`
- **输入字段**: 用户名、密码
- **登录成功**: 返回 JWT Token，跳转到工作台主页
- **登录失败**: 显示明确的错误提示（"用户名或密码错误" / "账号已过期，请联系管理员"）
- **状态保持**: Token 存储在 localStorage，前端 axios 拦截器自动携带 `Authorization: Bearer <token>`
- **Token 刷新**: 使用 JWT，设置合理过期时间（建议 24 小时）
- **自动登录**: 页面刷新时检测 localStorage 中是否存在有效 Token

### 3.2 注册功能

- **路径**: `/register`
- **输入字段**: 用户名、密码、确认密码、邮箱、邀请码
- **注册流程**:
  1. 验证用户名唯一性
  2. 验证密码强度（至少 6 位）
  3. 验证邮箱格式
  4. 验证邀请码有效性
  5. 根据邀请码等级自动分配角色
     - 一级邀请码 → 管理员
     - 二级邀请码 → 普通用户
  6. 邀请码标记为已使用（单次有效）
  7. 创建账号并跳转到**公司信息补充页面**
- **注册成功后的流程**:
  - 跳转到 `/complete-profile` 页面
  - 必须填写**公司名称**
  - 如果注册时是一级邀请码（管理员），公司名称由 super_admin 分发时预设或注册时填写
  - 如果注册时是二级邀请码（普通用户），公司名称继承邀请码分发者所在公司

### 3.3 邀请码管理

#### 3.3.1 邀请码属性

| 字段 | 类型 | 说明 |
|------|------|------|
| code | 字符串 | 唯一邀请码（建议 UUID 或随机字符串） |
| level | 整数 | 1=一级(管理员), 2=二级(用户) |
| company_name | 字符串 | 关联公司名称 |
| created_by | 外键 | 创建者用户 ID |
| created_at | 日期时间 | 创建时间 |
| expires_at | 日期时间 | 过期时间 |
| used_by | 外键/null | 使用者用户 ID（null=未使用） |
| used_at | 日期时间/null | 使用时间（null=未使用） |
| is_active | 布尔 | 是否启用 |

#### 3.3.2 邀请码分发

**最高级管理员 (super_admin)**:

- 可以生成一级邀请码（用于创建管理员）
- 可以生成二级邀请码（用于创建普通用户）
- 创建一级邀请码时需指定**公司名称**
- 创建二级邀请码时需指定**公司名称**

**管理员 (admin)**:

- 仅可生成二级邀请码（用于创建普通用户）
- 二级邀请码自动继承该管理员所在公司名称

#### 3.3.3 邀请码约束

- 每个邀请码只能使用一次
- 具有过期时间
- 过期后不可使用

### 3.4 公司机制

- **同公司共享话术库**: 同一公司的所有用户（管理员+普通用户）共享同一套话术库数据
- **数据隔离**: A 公司的用户看不到 B 公司的话术库
- 话术库表增加 `company_name` 字段
- 所有数据查询需根据当前用户所属公司过滤

### 3.5 账号管理

#### 3.5.1 账号信息

每个用户账号包含：

| 字段 | 说明 |
|------|------|
| 用户名 | 唯一 |
| 密码 | bcrypt 加密存储 |
| 邮箱 | 用于找回密码等 |
| 角色 | super_admin / admin / user |
| 公司名称 | 所属公司 |
| 邀请码 | 注册时使用的邀请码 |
| 注册时间 | 自动记录 |
| 最后登录时间 | 每次登录更新 |
| 账号过期时间 | 由邀请码分发时设置的过期时间继承 |
| 是否激活 | 账号状态 |

#### 3.5.2 用户管理界面

**访问权限**: super_admin 和 admin

**功能列表**:

1. **查看所有账号**: 列表展示用户名、角色、公司、邮箱、注册时间、最后登录时间、过期时间、状态
2. **筛选**: 按角色、公司、状态筛选
3. **管理邀请码**: 查看已分发的邀请码列表（代码、等级、过期时间、是否已使用、使用人）
4. **生成邀请码**: 根据不同角色权限生成对应等级的邀请码
5. **手动清除过期账号**:
   - 管理员清除已过期的普通用户账号
   - 最高级管理员清除已过期的管理员账号（同时级联删除其下属所有用户账号）
   - 清除操作前需二次确认

#### 3.5.3 级联删除规则

| 操作 | 影响 |
|------|------|
| Super Admin 删除 Admin A | Admin A 及其公司旗下所有 User 账号均被清除 |
| Admin 删除 User U | 仅 User U 被清除 |
| 删除某个账号 | 该账号关联的未使用邀请码一并作废 |

### 3.6 话术库权限控制

#### 3.6.1 用户权限限制

**用户（user）角色对话术库的操作限制**:

| 操作 | 权限 | 处理方式 |
|------|:----:|----------|
| 查看/搜索 | ✅ | 自由查看 |
| 新增 | ⚠️ | 提交审核请求 → 管理员批准后生效 |
| 编辑 | ⚠️ | 提交审核请求 → 管理员批准后生效 |
| 删除 | ❌ | 操作按钮隐藏或置灰 |

#### 3.6.2 审核流程

1. **用户提交**:
   - 新增/编辑话术时，系统提示"此操作需要管理员审核"
   - 数据写入**待审核表**（`pending_scripts`），状态为 `pending`
   - 前端显示"待审核"状态

2. **管理员审核**:
   - 在话术库管理页面看到「审核请求」入口
   - 可查看所有待审核的话术
   - 审核操作：**通过**（写入正式话术库）或 **驳回**（填写驳回原因）
   - 同一公司下的管理员可以看到该公司的所有待审核请求
   - super_admin 可以看到所有公司的待审核请求

3. **审核通知**:
   - 审核通过：话术自动进入正式库，用户可在列表中看到
   - 审核驳回：用户看到驳回原因，可修改后重新提交

#### 3.6.3 待审核话术表设计

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int PK | 主键 |
| content | text | 话术内容 |
| category_id | int FK | 分类 ID |
| keywords | string | 关键词 |
| action | enum('create', 'update') | 操作类型 |
| target_script_id | int/null | 如果是编辑操作，指向原话术 ID |
| submitted_by | int FK | 提交者用户 ID |
| status | enum('pending','approved','rejected') | 审核状态 |
| reviewed_by | int FK/null | 审核人用户 ID |
| review_reason | text/null | 驳回原因 |
| created_at | datetime | 提交时间 |
| reviewed_at | datetime/null | 审核时间 |

### 3.7 分类管理权限

- **用户（user）**: 无分类管理权限，分类选择器只读
- **管理员（admin）**: 完整的分类管理权限（增删改）
- **最高级管理员（super_admin）**: 完整的分类管理权限（增删改）

### 3.8 会话安全检查

- **路由守卫**: 未登录用户访问任何页面（除登录/注册页外）自动跳转到登录页
- **权限守卫**: 低权限用户访问高权限接口返回 403
- **Token 过期处理**: 自动跳转登录页，提示"登录已过期，请重新登录"

---

## 四、数据模型设计

### 4.1 新增表

#### users（用户表）

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'user',  -- super_admin / admin / user
    company_name VARCHAR(200),
    invitation_code_id INTEGER REFERENCES invitation_codes(id),
    is_active BOOLEAN DEFAULT TRUE,
    expires_at DATETIME,                      -- 账号过期时间
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### invitation_codes（邀请码表）

```sql
CREATE TABLE invitation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(64) UNIQUE NOT NULL,
    level INTEGER NOT NULL,                    -- 1=一级(管理员), 2=二级(用户)
    company_name VARCHAR(200),                 -- 关联公司名称
    created_by INTEGER REFERENCES users(id),   -- 创建者
    used_by INTEGER REFERENCES users(id),      -- 使用者(null=未使用)
    is_active BOOLEAN DEFAULT TRUE,
    expires_at DATETIME NOT NULL,              -- 过期时间
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### pending_scripts（待审核话术表）

```sql
CREATE TABLE pending_scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    keywords VARCHAR(500) DEFAULT '',
    action VARCHAR(20) NOT NULL,               -- 'create' / 'update'
    target_script_id INTEGER REFERENCES scripts(id),  -- 编辑时指向原话术
    submitted_by INTEGER REFERENCES users(id) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',      -- pending / approved / rejected
    reviewed_by INTEGER REFERENCES users(id),
    review_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME
);
```

### 4.2 修改现有表

#### scripts（话术表）

增加字段:

```sql
ALTER TABLE scripts ADD COLUMN company_name VARCHAR(200);
-- 注意：新建时直接包含 company_name 字段，无需 ALTER
```

所有话术数据增加 `company_name` 字段用于公司隔离。

### 4.3 关键外键关系

```
users.invitation_code_id → invitation_codes.id
invitation_codes.created_by → users.id
invitation_codes.used_by → users.id
pending_scripts.submitted_by → users.id
pending_scripts.reviewed_by → users.id
scripts.company_name → (逻辑关联) users.company_name
```

---

## 五、API 接口设计

### 5.1 认证接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 用户登录 | 公开 |
| POST | `/api/auth/register` | 用户注册 | 公开 |
| POST | `/api/auth/complete-profile` | 补充公司信息 | 已登录 |
| GET | `/api/auth/me` | 获取当前用户信息 | 已登录 |
| PUT | `/api/auth/change-password` | 修改密码 | 已登录 |

### 5.2 邀请码接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/invitation-codes/generate` | 生成邀请码 | super_admin / admin |
| GET | `/api/invitation-codes` | 邀请码列表 | super_admin / admin |
| DELETE | `/api/invitation-codes/{id}` | 作废邀请码 | super_admin / admin |

### 5.3 用户管理接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/users` | 用户列表 | super_admin / admin |
| GET | `/api/users/{id}` | 用户详情 | super_admin / admin |
| DELETE | `/api/users/{id}` | 清除用户（含级联） | super_admin / admin |
| PUT | `/api/users/{id}/expiry` | 设置/修改用户过期时间 | super_admin / admin |

### 5.4 审核接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/pending-scripts` | 待审核话术列表 | super_admin / admin |
| POST | `/api/pending-scripts/{id}/approve` | 通过审核 | super_admin / admin |
| POST | `/api/pending-scripts/{id}/reject` | 驳回审核 | super_admin / admin |

### 5.5 现有接口调整

| 现有接口 | 调整内容 |
|----------|----------|
| POST `/api/scripts` | user 角色改为写入 pending_scripts 表 |
| PUT `/api/scripts/{id}` | user 角色改为写入 pending_scripts 表 |
| DELETE `/api/scripts/{id}` | user 角色返回 403 |
| GET `/api/scripts` | 增加 company_name 过滤 |
| GET `/api/categories` | user 角色只读，无影响 |

---

## 六、前端页面设计

### 6.1 新增页面

| 页面 | 路径 | 说明 | 权限 |
|------|------|------|------|
| 登录页 | `/login` | 用户名密码登录 | 公开 |
| 注册页 | `/register` | 邮箱+邀请码注册 | 公开 |
| 公司信息补充页 | `/complete-profile` | 注册后补充公司信息 | 已登录 |
| 用户管理页 | `/users` | 用户+邀请码管理 | super_admin / admin |
| 审核管理页 | `/pending` | 话术审核请求管理 | super_admin / admin |

### 6.2 现有页面调整

| 页面 | 调整内容 |
|------|----------|
| Layout 组件 | 增加用户信息显示（头像、用户名、退出按钮）；根据权限显示/隐藏菜单项 |
| 全局路由 | 增加路由守卫，未登录跳转登录页 |
| 话术管理页 | user 角色隐藏删除按钮；新增/编辑按钮变"提交审核" |
| 分类管理页 | user 角色隐藏增删改操作按钮 |

### 6.3 登录页 UI 风格要求

> 美观大气简约

- **布局**: 居中卡片式布局，背景使用渐变色或浅色纹理
- **品牌元素**: 左上角或卡片内显示系统 Logo + 名称 "智能客服话术库系统"
- **表单**: 简洁的 Ant Design Form，用户名/密码输入框，登录按钮
- **额外链接**: "没有账号？立即注册" 跳转到注册页
- **响应式**: 适配桌面和移动端
- **错误提示**: 优雅的动画错误提示

### 6.4 注册页 UI 风格要求

- 与登录页保持一致的视觉风格
- 分步表单或单页表单
- 字段：用户名、邮箱、密码、确认密码、邀请码
- "已有账号？去登录" 链接

---

## 七、非功能性需求

### 7.1 安全

- 密码使用 bcrypt 加密存储
- JWT Token 使用 HS256 签名，secret 从环境变量读取
- 所有 API（除公开接口外）需要 Token 验证
- 输入校验：防止 SQL 注入、XSS 攻击
- 邀请码使用随机字符串（建议 UUID v4），不可预测

### 7.2 性能

- 登录/注册请求响应时间 < 1s
- Token 验证使用中间件，无额外数据库查询（仅验证签名）
- 邀请码生成使用批量预生成策略（避免高并发下的冲突）

### 7.3 可用性

- 登录失败明确提示原因
- 注册页字段实时校验
- 审核流程有进度提示
- 操作有二次确认弹窗
- 清晰的错误页面（403/404/500）

### 7.4 数据一致性

- 级联删除使用应用层事务保证
- 邀请码使用数据库唯一约束 + 应用层双重校验

---

## 八、数据隔离策略

### 8.1 公司级别隔离

当前话术库数据包含：

- categories（分类表）— 是否需要公司隔离？
  - **结论**: 需要。不同公司可能有不同的分类体系
- scripts（话术表）— **需要**公司隔离
- usage_logs（日志表）— **需要**记录操作者公司信息
- pending_scripts（待审核表）— **需要**公司隔离

### 8.2 公司隔离实现

所有数据表增加 `company_name` 字段，后端 CRUD 操作自动过滤：

```python
# 伪代码
def get_scripts(db, company_name, ...):
    query = db.query(Script).filter(Script.company_name == company_name)
    ...
```

前端 API 调用携带公司信息（从登录后的用户信息中获取）。

---

## 九、边界情况与特殊说明

1. **唯一管理员 admin**: 系统内置，不可删除，不可修改角色，可通过后台修改密码
2. **公司名称确定后不可修改**: 一个账号绑定一个公司，公司名称不可更改
3. **邀请码不可重复使用**: 即使未过期，使用一次即失效
4. **过期账号自动禁用**: 登录时检测账号是否过期，过期则禁止登录
5. **管理员被删除级联效果**: 该管理员及其公司下的所有用户均被标记为禁用/删除
6. **超级管理员视角**: 可以看到所有公司的数据（用于全局管理）
7. **管理员视角**: 只能看到自己公司的数据
8. **用户视角**: 只能看到自己公司的数据
9. **初始数据**: init_db 时需要创建默认 super_admin 账号（用户名见 app/config.py，初始口令来自 .env 的 SUPER_ADMIN_PASSWORD）
