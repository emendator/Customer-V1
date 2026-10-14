# 智能客服话术库系统 — 系统架构设计

> 版本: v1.0  
> 更新日期: 2026-07-15

---

## 一、整体架构图

```mermaid
graph TB
    subgraph 前端["前端 (React + Vite + Ant Design)"]
        WB[客服工作台]
        SM[话术库管理]
        CM[分类管理]
        IE[导入导出]
    end

    subgraph 后端["后端 (FastAPI)"]
        direction TB
        API[API 路由层]
        SRV[服务层 Services]
        CRUD[数据访问层 CRUD]
        
        subgraph 服务层
            MATCHER[本地匹配引擎]
            AI_SRV[大模型调用服务]
            EXCEL_SRV[Excel处理服务]
        end
    end

    subgraph 数据["数据层"]
        DB[(SQLite)]
        LLM[大模型 API<br/>OpenAI 兼容]
    end

    WB -->|HTTP/Axios| API
    SM -->|HTTP/Axios| API
    CM -->|HTTP/Axios| API
    IE -->|HTTP/Axios| API
    
    API --> SRV
    SRV --> CRUD
    CRUD --> DB
    MATCHER --> DB
    AI_SRV --> LLM
    AI_SRV --> MATCHER
```

---

## 二、核心流程设计

### 2.1 本地匹配模式流程

```mermaid
sequenceDiagram
    participant U as 客服人员
    participant FE as 前端
    participant BE as 后端
    participant DB as SQLite

    U->>FE: 1. 粘贴客户问题
    U->>FE: 2. 选择问题分类(可选)
    FE->>BE: POST /api/analyze/local<br/>{query, category_id}
    BE->>BE: Jieba 分词 + 关键词提取
    alt 选择了分类
        BE->>DB: 查询该分类下的话术
    else 未选择分类
        BE->>DB: 查询全部启用的话术
    end
    DB-->>BE: 候选话术列表
    BE->>BE: TF-IDF 向量化 + 余弦相似度
    BE->>BE: 排序取 Top 5
    BE-->>FE: {matches: [{script, score}]}
    FE->>U: 3. 展示匹配结果卡片
    U->>FE: 4. 选择一条回复使用
    FE->>BE: POST /api/analyze/feedback<br/>{script_id, query, mode:'local'}
    BE->>DB: 更新使用次数 + 记录日志
```

### 2.2 AI 智能模式流程

```mermaid
sequenceDiagram
    participant U as 客服人员
    participant FE as 前端
    participant BE as 后端
    participant LLM as 大模型 API

    U->>FE: 1. 打开 AI 开关
    U->>FE: 2. 粘贴客户问题
    U->>FE: 3. 选择分类(可选)
    FE->>BE: POST /api/analyze/ai<br/>{query, category_id}
    BE->>BE: 先本地匹配 Top3 作为参考
    BE->>BE: 构造完整 Prompt
    BE->>LLM: 调用大模型 API
    alt 调用成功
        LLM-->>BE: 3~5条 AI 生成的回复
        BE-->>FE: {responses: [{content, angle}]}
        FE->>U: 4. 展示 AI 生成结果(标注AI标签)
    else 调用失败/超时
        BE->>BE: 回退到本地匹配
        BE-->>FE: 本地匹配结果 + 降级提示
    end
    U->>FE: 5. 选择一条回复使用
    FE->>BE: POST /api/analyze/feedback<br/>{content, category_id, mode:'ai'}
    BE->>DB: AI生成内容写入话术库 + 记录日志
```

### 2.3 Excel 导入流程

```mermaid
sequenceDiagram
    participant U as 管理员
    participant FE as 前端
    participant BE as 后端
    participant DB as SQLite

    U->>FE: 1. 上传 Excel 文件
    FE->>BE: POST /api/upload/excel<br/>(multipart/form-data)
    BE->>BE: openpyxl 解析文件
    BE->>BE: 提取表头 + 前10行预览
    BE-->>FE: {headers, preview_rows, total_rows}
    FE->>U: 2. 展示预览表格
    U->>FE: 3. 映射列 + 选择导入策略
    FE->>BE: POST /api/upload/import<br/>{column_mapping, strategy}
    BE->>BE: 按映射关系解析数据
    loop 逐行处理
        BE->>DB: 写入话术表
    end
    BE-->>FE: {success_count, fail_count, errors}
    FE->>U: 4. 展示导入结果
```

---

## 三、前端组件树

```mermaid
graph TB
    App[App.tsx]
    App --> Layout[Layout.tsx<br/>侧边栏 + 内容区]
    
    Layout --> WB[Workbench.tsx<br/>客服工作台]
    Layout --> SM[ScriptManage.tsx<br/>话术管理]
    Layout --> CM[CategoryManage.tsx<br/>分类管理]
    Layout --> IE[ImportExport.tsx<br/>导入导出]
    
    WB --> AiToggle[AiToggle.tsx<br/>AI开关]
    WB --> QueryInput[TextArea<br/>问题输入]
    WB --> CatSelector[CategorySelector.tsx<br/>分类按钮组]
    WB --> ScriptList[ScriptCardList.tsx<br/>结果列表]
    
    ScriptList --> ScriptCard[ScriptCard.tsx<br/>话术卡片 × N]
    
    SM --> ScriptTable[Table<br/>话术列表]
    SM --> ScriptModal[Modal<br/>新增/编辑话术]
    
    CM --> CategoryTree[Tree/Table<br/>分类层级]
    
    IE --> UploadArea[Dragger<br/>文件上传]
    IE --> PreviewTable[Table<br/>预览表格]
    IE --> ImportResult[Result<br/>导入结果]
```

---

## 四、数据库 ER 图

```mermaid
erDiagram
    Category ||--o{ Category : "parent_id"
    Category ||--o{ Script : "category_id"
    Category ||--o{ UsageLog : "category_id"
    Script ||--o{ UsageLog : "script_id"

    Category {
        int id PK
        string name
        int parent_id FK "NULL=一级分类"
        int sort_order
        bool is_active
    }

    Script {
        int id PK
        text content
        int category_id FK
        string keywords
        int usage_count
        int rating_good
        int rating_bad
        string source "manual/ai/excel"
        bool is_active
        datetime created_at
        datetime updated_at
    }

    UsageLog {
        int id PK
        int script_id FK "可为NULL(AI模式)"
        text customer_query
        int category_id FK
        string mode "local/ai"
        int rating "NULL=未评分"
        datetime created_at
    }
```

---

## 五、API 接口设计

### 5.1 分类接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/categories` | 获取分类树（含话术计数） |
| GET | `/api/categories/{id}` | 获取单个分类详情 |
| POST | `/api/categories` | 新增分类 |
| PUT | `/api/categories/{id}` | 编辑分类 |
| DELETE | `/api/categories/{id}` | 删除分类（检查关联） |

### 5.2 话术接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/scripts` | 话术列表（分页+搜索+筛选） |
| GET | `/api/scripts/{id}` | 话术详情 |
| POST | `/api/scripts` | 新增话术 |
| PUT | `/api/scripts/{id}` | 编辑话术 |
| DELETE | `/api/scripts/{id}` | 删除话术 |
| POST | `/api/scripts/batch-delete` | 批量删除 |
| PUT | `/api/scripts/{id}/toggle` | 启用/禁用切换 |

### 5.3 智能分析接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/analyze/local` | 本地匹配分析 |
| POST | `/api/analyze/ai` | AI 智能分析 |
| POST | `/api/analyze/feedback` | 用户反馈（使用/评分） |

### 5.4 导入导出接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload/excel` | 上传 Excel 并预览 |
| POST | `/api/upload/import` | 确认导入 |
| GET | `/api/export/scripts` | 导出话术为 Excel |
| GET | `/api/export/template` | 下载导入模板 |

---

## 六、关键设计决策

### 6.1 为什么选择 SQLite？

- 客服话术数据量级小（通常在万条以内）
- 不需要额外的数据库服务器，降低部署复杂度
- 数据文件可直接备份、迁移
- SQLAlchemy 支持良好，未来可无缝切换到 PostgreSQL/MySQL

### 6.2 本地匹配算法选择

- **jieba 分词**：中文分词成熟方案，轻量无依赖
- **TF-IDF + 余弦相似度**：经典文本相似度方案，对于短文本（客服话术通常较短）效果好
- **预加载索引**：启动时将话术库加载到内存，避免每次请求都查询数据库
- **分类预过滤**：如果用户选了分类，大幅缩小候选集，提升匹配精度和速度

### 6.3 AI 模式设计考量

- **本地匹配作为参考**：将本地匹配 Top3 作为 Prompt 中的参考话术，帮助大模型理解语境
- **结构化输出**：要求 JSON 格式输出，便于前端解析展示
- **降级策略**：AI 不可用时自动回退本地模式，保证系统可用性
- **反馈闭环**：AI 生成的优质回复可以沉淀到话术库，逐步减少对 AI 的依赖

### 6.4 前端状态管理策略

- 项目规模适中，不引入 Redux/Zustand 等状态管理库
- 使用 React 内置的 `useState` + `useEffect` 管理组件状态
- API 调用结果直接驱动 UI 更新
- 跨组件共享的状态（如分类列表）通过 props 或 Context 传递

---

## 七、部署架构

```mermaid
graph TB
    subgraph 单机部署
        Nginx[Nginx<br/>端口 80/443]
        FE_Static[前端静态文件<br/>React build]
        Uvicorn[Uvicorn<br/>端口 8000]
        FastAPI[FastAPI 应用]
        SQLite[(SQLite 文件)]
        
        Nginx -->|静态资源| FE_Static
        Nginx -->|/api/* 代理| Uvicorn
        Uvicorn --> FastAPI
        FastAPI --> SQLite
    end
    
    Internet((互联网)) --> Nginx
    LLM_API[大模型 API<br/>外部服务] --> FastAPI
```

### 部署要点

1. 前端 `npm run build` 生成静态文件，由 Nginx 托管
2. Nginx 配置反向代理 `/api/*` → `http://127.0.0.1:8000`
3. 后端使用 `uvicorn` 或 `gunicorn + uvicorn worker` 运行
4. API Key 等敏感信息通过 `.env` 文件或环境变量注入
5. SQLite 文件放在项目目录外或做好权限控制
