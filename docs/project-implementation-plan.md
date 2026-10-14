# 智能客服话术库系统 — 项目实施步骤

> 版本: v1.0  
> 更新日期: 2026-07-15

---

## 项目结构总览

```
smart-cs-assist/
├── backend/                    # Python FastAPI 后端
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py             # FastAPI 入口 + 路由注册
│   │   ├── config.py           # 配置管理（环境变量、API Key等）
│   │   ├── database.py         # SQLAlchemy 引擎 + Session
│   │   ├── models.py           # 数据模型定义
│   │   ├── schemas.py          # Pydantic 请求/响应模型
│   │   ├── crud/
│   │   │   ├── __init__.py
│   │   │   ├── category.py     # 分类 CRUD
│   │   │   ├── script.py       # 话术 CRUD
│   │   │   └── log.py          # 日志 CRUD
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── categories.py   # 分类相关路由
│   │   │   ├── scripts.py      # 话术 CRUD 路由
│   │   │   ├── analyze.py      # 智能分析路由（本地+AI）
│   │   │   └── upload.py       # Excel 上传导入路由
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── matcher.py      # 本地匹配算法
│   │   │   ├── ai_service.py   # 大模型调用服务
│   │   │   └── excel_service.py # Excel 读写服务
│   │   └── utils/
│   │       ├── __init__.py
│   │       └── text_utils.py   # 文本处理工具
│   ├── requirements.txt
│   └── init_db.py              # 初始化数据库脚本
├── data/                       # 数据目录（数据库 + 上传文件，自动生成，删除后可重建）
│   ├── smart_cs.db            # SQLite 数据库文件
│   └── uploads/               # 上传文件临时存放
├── frontend/                   # React + Vite + Ant Design
│   ├── public/
│   ├── src/
│   │   ├── api/                # API 请求封装
│   │   │   ├── index.ts        # Axios 实例 + 拦截器
│   │   │   ├── scripts.ts      # 话术相关 API
│   │   │   ├── categories.ts   # 分类相关 API
│   │   │   ├── analyze.ts      # 分析相关 API
│   │   │   └── upload.ts       # 上传相关 API
│   │   ├── components/         # 通用组件
│   │   │   ├── Layout.tsx      # 页面布局（侧边栏+顶栏）
│   │   │   ├── AiToggle.tsx    # AI 模式开关
│   │   │   ├── CategorySelector.tsx  # 分类选择按钮组
│   │   │   ├── ScriptCard.tsx  # 话术回复卡片
│   │   │   └── ScriptCardList.tsx    # 话术卡片列表
│   │   ├── pages/              # 页面组件
│   │   │   ├── Workbench.tsx   # 客服工作台（主页面）
│   │   │   ├── ScriptManage.tsx # 话术库管理
│   │   │   ├── CategoryManage.tsx # 分类管理
│   │   │   └── ImportExport.tsx # 导入导出
│   │   ├── types/              # TypeScript 类型定义
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docs/                       # 项目文档
│   ├── requirements-analysis.md
│   ├── project-implementation-plan.md
│   └── architecture-design.md
└── README.md
```

---

## 实施步骤

### 第一阶段：项目初始化与环境搭建（预计 0.5 天）

#### Step 1.1：创建项目目录结构

```powershell
# 在 workspace 下创建
mkdir backend\app\crud, backend\app\routers, backend\app\services, backend\app\utils
data 目录（data\ 及 data\uploads\）由程序运行时自动创建，无需手工建立
mkdir frontend\src\api, frontend\src\components, frontend\src\pages, frontend\src\types
mkdir docs
```

#### Step 1.2：初始化后端

- 创建 `backend/requirements.txt`，包含：

  ```
  fastapi==0.109.0
  uvicorn[standard]==0.27.0
  sqlalchemy==2.0.25
  pydantic==2.5.0
  python-multipart==0.0.6
  openpyxl==3.1.2
  pandas==2.1.4
  jieba==0.42.1
  scikit-learn==1.4.0
  openai==1.7.0
  python-dotenv==1.0.0
  ```

- 配置 Python 虚拟环境
- 创建 `backend/app/config.py` 管理配置

#### Step 1.3：初始化前端

- 使用 Vite 创建 React + TypeScript 项目
- 安装依赖：

  ```powershell
  npm install antd @ant-design/icons axios react-router-dom dayjs
  ```

- 配置 `vite.config.ts` 代理 `/api` → `localhost:8000`
- 配置 `tsconfig.json` 路径别名

---

### 第二阶段：数据库与后端基础 CRUD（预计 1 天）

#### Step 2.1：数据库模型

- 在 `backend/app/models.py` 中定义三张表：
  - `Category`：分类表
  - `Script`：话术表
  - `UsageLog`：使用日志表
- 初始化 `backend/app/database.py`，配置 SQLite 连接
- 编写 `backend/init_db.py` 初始化脚本，预置默认分类数据

#### Step 2.2：Pydantic Schema

- 在 `backend/app/schemas.py` 中定义请求/响应模型：
  - `CategoryCreate`, `CategoryUpdate`, `CategoryResponse`
  - `ScriptCreate`, `ScriptUpdate`, `ScriptResponse`, `ScriptListResponse`
  - `AnalyzeRequest`, `AnalyzeResponse`, `ScriptMatch`
  - `AIAnalyzeRequest`, `AIResponse`
  - `FeedbackRequest`

#### Step 2.3：CRUD 操作层

- `backend/app/crud/category.py`：分类增删改查、树形结构查询
- `backend/app/crud/script.py`：话术增删改查、分页搜索、批量操作
- `backend/app/crud/log.py`：使用日志记录

#### Step 2.4：路由层

- `backend/app/routers/categories.py`：
  - `GET /api/categories` — 获取分类树
  - `POST /api/categories` — 新增分类
  - `PUT /api/categories/{id}` — 编辑分类
  - `DELETE /api/categories/{id}` — 删除分类

- `backend/app/routers/scripts.py`：
  - `GET /api/scripts` — 话术列表（分页+搜索+筛选）
  - `GET /api/scripts/{id}` — 话术详情
  - `POST /api/scripts` — 新增话术
  - `PUT /api/scripts/{id}` — 编辑话术
  - `DELETE /api/scripts/{id}` — 删除话术
  - `POST /api/scripts/batch-delete` — 批量删除

- `backend/app/routers/upload.py`：
  - `POST /api/upload/excel` — 上传 Excel 并解析预览
  - `POST /api/upload/import` — 确认导入
  - `GET /api/export/scripts` — 导出话术为 Excel

#### Step 2.5：API 统一响应格式

```json
{
  "success": true,
  "data": {},
  "message": "操作成功"
}
```

---

### 第三阶段：前端页面开发（预计 1.5 天）

#### Step 3.1：基础框架搭建

- `Layout.tsx`：侧边栏导航（工作台 / 话术管理 / 分类管理 / 导入导出）
- `App.tsx`：React Router 路由配置
- `api/index.ts`：Axios 实例封装（baseURL、错误拦截、统一提示）

#### Step 3.2：话术库管理页面（ScriptManage.tsx）

- **列表功能**：
  - Ant Design Table 分页表格
  - 搜索框 + 分类筛选下拉 + 状态筛选
  - 操作列：编辑 / 删除 / 启用禁用
- **新增/编辑弹窗**：
  - Ant Design Modal + Form
  - 分类级联选择（Cascader）
  - 关键词 Tag 输入
- **批量操作**：
  - 行选择 + 批量删除按钮
  - 二次确认 Popconfirm

#### Step 3.3：分类管理页面（CategoryManage.tsx）

- **树形表格**：Ant Design Tree 或 Table 展示分类层级
- **操作**：添加同级/子级分类、编辑、删除
- **统计**：每个分类下的话术数量

#### Step 3.4：导入导出页面（ImportExport.tsx）

- **上传区域**：Ant Design Upload + Dragger
- **预览表格**：解析后的 Excel 数据预览
- **列映射**：Select 下拉选择 Excel 列与数据库字段对应
- **导入按钮**：确认导入并显示结果

---

### 第四阶段：客服工作台核心功能（预计 1.5 天）

#### Step 4.1：工作台主页面（Workbench.tsx）

- **布局**：
  - 顶部：AI 开关 + 设置按钮
  - 左侧：问题输入区（TextArea）+ 分类选择按钮组
  - 右侧：分析结果展示区（话术卡片列表）
- **状态管理**：
  - `customerQuery`：客户问题文本
  - `selectedCategory`：选中的分类
  - `aiMode`：AI 模式开关
  - `results`：匹配/生成结果列表
  - `loading`：分析中状态

#### Step 4.2：分类选择器（CategorySelector.tsx）

- **一级分类按钮组**：Button Group，水平排列
- **二级分类下拉**：选中一级后展示二级，用 Tag 或小按钮
- **选中高亮**：选中的分类高亮显示
- **可取消选择**：再次点击取消

#### Step 4.3：AI 模式开关（AiToggle.tsx）

- Ant Design Switch + 文字说明
- 切换时清空当前结果
- 显示当前模式标签

#### Step 4.4：话术卡片列表（ScriptCardList.tsx）

- 每条结果显示为 Card：
  - 序号 + 匹配度（本地模式）/ AI 标签（AI 模式）
  - 话术内容（可展开/收起）
  - 分类标签 Tag
  - 操作按钮：使用 / 复制 / 评分
- 空状态：Empty 组件提示
- 加载状态：Skeleton 组件

---

### 第五阶段：智能分析服务（预计 1 天）

#### Step 5.1：本地匹配算法（matcher.py）

- **流程**：
  1. 用 jieba 对客户问题进行分词 + 提取关键词
  2. 如果选择了分类，仅在该分类及子分类下搜索，缩小范围
  3. 用 jieba 对所有候选话术进行分词
  4. 使用 TF-IDF 向量化 + 余弦相似度计算匹配分
  5. 按分数降序排列，返回 Top 5
- **优化**：
  - 话术库内容在启动时预加载到内存
  - 增量更新（新增/修改话术时更新内存索引）

#### Step 5.2：大模型调用服务（ai_service.py）

- **Prompt 模板设计**：

  ```
  你是一名专业的售后客服专家。请根据以下客户反馈，生成3~5条专业、礼貌、有同理心的客服回复。

  【客户问题】{customer_query}
  【问题分类】{category_name}
  【参考话术】{matched_scripts}  （从本地匹配的Top3作为参考）

  要求：
  1. 每条回复应针对不同角度（如：致歉安抚、解决方案、后续跟进）
  2. 语气专业礼貌，体现同理心
  3. 不承诺无法兑现的事项
  4. 回复简洁有力，每条不超过200字

  请以JSON数组格式输出，每项包含：
  - "content": 回复内容
  - "angle": 回复角度（致歉/解决/跟进等）
  - "tone": 语气风格（正式/温和/简洁）
  ```

- **API 调用**：使用 OpenAI SDK，支持自定义 Base URL
- **超时处理**：设置 15 秒超时，失败时回退本地模式
- **响应解析**：解析 JSON 数组，容错处理

#### Step 5.3：分析路由（analyze.py）

- `POST /api/analyze/local`：
  - 接收：`{ query, category_id?, top_k? }`
  - 调用 matcher 服务
  - 返回：`{ matches: [{ script, score, category }] }`

- `POST /api/analyze/ai`：
  - 接收：`{ query, category_id? }`
  - 调用 ai_service
  - 返回：`{ responses: [{ content, angle, tone }] }`

- `POST /api/analyze/feedback`：
  - 接收：`{ script_id?, content, category_id, query, mode, rating? }`
  - 作用：记录使用日志，AI 生成内容入库，更新使用次数

---

### 第六阶段：联调测试与优化（预计 0.5~1 天）

#### Step 6.1：前后端联调

- 确保所有 API 接口正常通信
- 处理跨域问题（FastAPI CORS 中间件）
- 验证 Excel 导入全流程

#### Step 6.2：边界情况处理

- 话术库为空时本地匹配的降级提示
- AI API Key 未配置时的提示
- 上传非 Excel 文件的校验
- 大批量数据导入的性能

#### Step 6.3：体验优化

- 输入防抖（500ms 后触发分析）
- 骨架屏加载态
- 操作成功/失败 Toast 提示
- 复制成功的反馈动效

---

## 关键约定

1. **API 路径规范**：全部以 `/api/` 开头
2. **统一响应格式**：`{ success: boolean, data: any, message: string }`
3. **前端请求封装**：统一在 `api/` 目录下管理，不散落各组件
4. **数据库操作**：通过 CRUD 层，不在路由中直接写 SQL
5. **状态管理**：小项目不使用 Redux，用 React useState + useEffect
6. **错误处理**：后端统一异常处理中间件，前端 Axios 拦截器统一提示
7. **SQLite 配置**：`check_same_thread=False`，数据库文件与上传文件统一放在项目根目录 `data/`（自动生成）

---

## 预计总工时

| 阶段 | 内容 | 预计时间 |
| ------ | ------ | ---------- |
| 第一阶段 | 项目初始化 | 0.5 天 |
| 第二阶段 | 数据库 + CRUD 后端 | 1 天 |
| 第三阶段 | 前端管理页面 | 1.5 天 |
| 第四阶段 | 客服工作台 | 1.5 天 |
| 第五阶段 | 智能分析服务 | 1 天 |
| 第六阶段 | 联调优化 | 0.5~1 天 |
| **合计** | | **约 6 天** |

---

## 启动命令

```powershell
# 后端
cd backend
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm run dev
```
