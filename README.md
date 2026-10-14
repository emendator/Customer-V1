# 💬 智能客服话术库系统

> 🌐 语言 / Language：**中文**（本文件） · [**English → README_EN.md**](README_EN.md)
>
> 徽章位：(待补充：构建状态 / 许可证 / 版本 徽章)

## 项目简介

**智能客服话术库系统**是一个面向客服人员的 AI 辅助工具：把客户问题粘贴进来，系统自动给出若干条可直接发送的专业回复，同时把被选用的优质回复沉淀成企业自有话术库。用的人越多，话术库越丰富。

- **本地匹配模式（默认，离线可用）**：基于 jieba 分词 + TF-IDF 余弦相似度，从自己公司的话术库中检索最相关的回复，不依赖任何外部服务，也不需要 API Key。
- **AI 智能模式（可选）**：接入 OpenAI 兼容的大模型接口，生成带「回复角度 / 语气」的回复，并支持按客服流程场景生成标准话术、为批量导入的话术自动补充分类与关键词。

典型场景：电商 / 微信等渠道的售后接待、企业客服标准话术管理、客服新人培训参考。

## 功能特性

| 模块 | 能力 |
| ------ | ------ |
| 客服工作台 | 粘贴客户问题 → 选分类 → 分析 → 得到多条候选回复，支持复制、选用、👍/👎 评分；结果页可缓存，切页返回不重复请求 |
| 话术库管理 | 关键词搜索、类 Excel 表头列筛选、增删改、批量删除/新增、启用与禁用、使用次数与好评差评统计 |
| Excel 导入导出 | 上传 `.xlsx/.xls/.csv` → 列映射与导入策略（追加/去重）→ 确认导入；可导出全部或按筛选/勾选导出；提供导入模板 |
| 分类管理 | 两级分类树（大类 → 细分），带话术计数，初始内置 8 个一级分类 |
| 话术审核 | 普通用户的新增/修改进入待审核队列，管理员通过或驳回（驳回须填原因） |
| 用户与邀请码 | 三级角色 + 邀请码注册、账号有效期、回收站（已清除账号 / 已删除邀请码） |
| 游客体验 | 免注册一键进入，自动创建一次性独立账号与临时公司，退出即清除全部数据 |
| 多公司隔离 | 同公司共享话术库与分类，跨公司完全隔离；加入公司需校验公司密码 |
| API Key 安全存储 | 按账号独立配置，AES-256-GCM + PBKDF2 加盐加密后落库，不存明文、不写 `.env` |
| Token 统计 | 每次 AI 调用记录用量，账号维度累计展示 |
| 界面 | React + Ant Design 5，深/浅双主题（默认深色），响应式布局与交互动效 |

> 说明：每次分析结果的第一条固定为同分类下的「无异常回复」安抚话术，该话术与其他话术一样可以在话术库中自行维护或删除。

## 技术栈

| 层级 | 技术 |
| ------ | ------ |
| 前端框架 | React 18 + TypeScript 5 |
| 前端 UI / 构建 | Ant Design 5、Vite 5、axios、react-router-dom 6 |
| 后端框架 | Python + FastAPI（uvicorn） |
| ORM / 数据库 | SQLAlchemy 2 + SQLite（单文件，无需安装数据库） |
| 认证与密码 | JWT（python-jose）+ bcrypt（passlib） |
| 凭据加密 | cryptography（AES-256-GCM + PBKDF2-HMAC-SHA256） |
| 中文匹配 | jieba + scikit-learn（TF-IDF / 余弦相似度） |
| Excel | pandas + openpyxl |
| 大模型 | openai SDK（OpenAI 兼容接口，默认配置指向 DeepSeek） |

## 架构与数据流

```text
┌──────────────────────────────────────────────┐
│ 浏览器：React 单页应用（开发端口 5175）          │
│ axios 自动携带 JWT → 请求 /api/*               │
└───────────────────────┬──────────────────────┘
                        │ Vite 开发代理 / Nginx 反向代理
                        ▼
┌──────────────────────────────────────────────┐
│ 后端：FastAPI（默认端口 8002）backend/app       │
│ routers（接口）→ crud（数据访问）→ models（表）  │
│ services：matcher（本地匹配）/ ai_service / excel│
└──────┬───────────────────────┬───────────────┘
       ▼                       ▼
  SQLite 业务库          大模型 OpenAI 兼容接口
  data/smart_cs.db      （可选；未配置 Key 时自动降级本地匹配）
```

- 业务数据（账号、公司、分类、话术、日志、审核、Token 用量）全部保存在 `data/smart_cs.db`；
- 上传的 Excel 存于 `data/uploads/`，导出文件与模板存于 `data/output/`；
- 加密与签名密钥保存在 `data/secret.key`（自动生成，删除后历史加密的 API Key 将无法解密）。

## 快速开始

### 环境要求

- Python 3.10+（Windows 一键启动脚本支持 3.10 ~ 3.13）
- Node.js 18+
- 无需单独安装数据库

### 准备配置文件（必做）

后端配置读取自 `backend/.env`（首次可复制 `backend/.env.example`）。其中**两项必须填写**，否则服务会直接拒绝启动：

```bash
cd backend
cp .env.example .env        # Windows 可用：copy .env.example .env
```

然后编辑 `backend/.env`，至少填写这两项：

```ini
SUPER_ADMIN_PASSWORD=<内置超级管理员的登录口令>
SUPER_ADMIN_COMPANY_PASSWORD=<该公司的公司数据库密码>
```

> 源码中不保留任何默认口令；缺少这两项时后端会打印明确原因后退出，避免使用可被猜到的默认密码。

### 方式一：Windows 一键启动

双击项目根目录的 **`启动.bat`**：自动检测 Python / Node.js → 生成 `backend/.env`（若不存在）→ 安装依赖并初始化数据库 → 分别启动后端（8002）与前端（5175）→ 健康检查通过后自动打开浏览器。关闭两个命令行窗口即可停止服务。

### 方式二：手动启动（跨平台）

后端：

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python init_db.py                     # 首次初始化数据库（服务启动时也会自动建表与初始化）
python -m uvicorn app.main:app --host 127.0.0.1 --port 8002
```

前端（另开一个终端）：

```bash
cd frontend
npm install
npm run dev        # http://localhost:5175，/api 自动代理到 8002
```

生产构建：`npm run build`（产物在 `frontend/dist/`）。后端启动后可访问 `http://localhost:8002/docs` 查看自动生成的接口文档。

### 首次使用

1. 打开 `http://localhost:5175`；
2. 想快速体验：点击「游客登录」，免注册进入（数据临时、退出即清除）；
3. 正式使用：用邀请码注册 → 填写「公司名称 + 公司密码」（创建新公司或加入已有公司）→ 进入工作台；
4. 配置 AI（可选）：右上角用户名 →「API Key 配置」，填入大模型平台签发的 Key。

> ⚠️ 系统首次启动会自动创建内置超级管理员账号，其登录口令来自 `backend/.env` 的 `SUPER_ADMIN_PASSWORD`（源码中**不含任何默认口令**）。**启动前必须先设置该项**，缺失时服务会拒绝启动。修改账号信息与口令的方法见下方「如何修改最高级管理员的信息」。

## 配置说明

配置文件为 `backend/.env`（可由 `backend/.env.example` 复制生成，仓库中不含任何真实密钥）。

| 变量 | 说明 |
| ------ | ------ |
| `LLM_BASE_URL` | 大模型 OpenAI 兼容接口地址，默认 `https://api.deepseek.com` |
| `LLM_MODEL` | 模型名，`.env.example` 示例值为 `deepseek-v4-flash` |
| `SUPER_ADMIN_PASSWORD` | **必填**。内置超级管理员的登录口令；源码中不保留默认值，缺失时服务拒绝启动 |
| `ADMIN_API_KEY` | 可选。仅在内置超级管理员首次创建时写入一次；留空则不预置 |
| `HOST` / `PORT` | 后端监听地址与端口，默认 `0.0.0.0` / `8002` |
| `DEBUG` | 调试开关，默认 `true` |
| `DATABASE_URL` | 留空则使用默认的 `data/smart_cs.db` |
| `DATA_DIR` | 数据目录，默认为项目根目录下的 `data/` |
| `SECRET_KEY` | 凭据加密与 JWT 签名密钥。不设置时系统会自动生成随机密钥并保存到 `data/secret.key`（请勿删除；更换后历史加密的 API Key 需重新配置） |
| `SUPER_ADMIN_COMPANY_PASSWORD` | **必填**。内置管理员所属公司的「公司数据库密码」（其他账号加入该公司时校验）；缺失时服务拒绝启动 |
| `SQLITE_TIMEOUT` | SQLite 超时时间（秒），默认 30 |

> 各账号的 API Key 按账号加密存储在数据库中，**不通过 `.env` 配置**，也不随仓库分发。

## 使用指南

| 页面 | 路由 | 说明 |
| ------ | ------ | ------ |
| 登录 / 注册 | `/login`、`/register` | 登录、游客登录、邀请码注册 |
| 完善公司信息 | `/complete-profile` | 创建公司或加入已有公司（校验公司密码） |
| 客服工作台 | `/workbench` | 核心页：输入客户问题、选分类、分析、选用与复制 |
| 话术库管理 | `/scripts` | 搜索筛选、增删改、批量操作、Excel 导入导出 |
| 分类管理 | `/categories` | 两级分类维护（管理员与游客可写，普通用户只读） |
| 用户管理 | `/users` | 账号、邀请码、回收站、公司密码（管理员以上） |
| 审核管理 | `/pending` | 待审核话术的通过与驳回（管理员以上） |
| API Key 配置 | `/api-key` | 配置大模型 Key、查看累计 Token 消耗 |

**角色与权限**

| 角色 | 获取方式 | 话术库 | 分类管理 | 审核管理 | 用户/邀请码管理 |
| ------ | ------ | :------: | :------: | :------: | :------: |
| 超级管理员 | 系统内置，固定不可删 | 增删改查 | ✅ | ✅ | ✅ 全部用户 |
| 管理员 | 一级邀请码注册 | 本公司增删改查 | ✅ 本公司 | ✅ 本公司 | ✅ 自己邀请的账号 |
| 普通用户 | 二级邀请码注册 | 查看；新增/编辑需审核 | 只读 | ❌ | ❌ |
| 游客 | 登录页一键进入 | 临时数据增删改查 | ✅ | ❌ | ❌ |

## 如何修改最高级管理员的信息

内置超级管理员（用户名 `admin`）的信息分三类，改动位置与生效方式不同：

| 要改的内容 | 改哪里 | 生效方式 |
| ------ | ------ | ------ |
| 用户名 / 所属公司 / 邮箱 | `backend/app/config.py` 的 `SUPER_ADMIN_USERNAME`、`SUPER_ADMIN_COMPANY`、`SUPER_ADMIN_EMAIL` | 改完重启后端即可：启动时会把内置管理员记录校正为这三项（不影响业务数据） |
| 登录口令 | `backend/.env` 的 `SUPER_ADMIN_PASSWORD` | 仅在**首次创建**、或**库中口令为空**时写入；已设置过的口令不会被自动覆盖（见下） |
| 公司数据库密码 | `backend/.env` 的 `SUPER_ADMIN_COMPANY_PASSWORD`，或登录后进入「用户管理 → 公司数据库密码」 | 前者仅在未设置时写入初始值；后者可随时修改，改后该公司所有账号同步生效 |

### 修改登录口令（账号已存在时）

为保证"启动时不覆盖你已经改好的口令"，系统不会用 `.env` 中的值自动覆盖库中已有的口令。要主动切换口令，请用下面的命令，把该账号的口令按 `.env` 中的新值直接重写（`users.password_hash` 是 NOT NULL 列，不能置空）：

1. 修改 `backend/.env` 中的 `SUPER_ADMIN_PASSWORD`；
2. 执行下面的命令（它会读取 `.env` 中的新口令并写入数据库）；
3. 用新口令登录（无需重启后端）。

```bash
cd backend
# 数据库默认位于项目根目录 data/ ；若改过 DATA_DIR / DATABASE_URL，请相应调整路径
python -c "import sqlite3;from app.auth import get_password_hash;from app.config import SUPER_ADMIN_PASSWORD;c=sqlite3.connect('../data/smart_cs.db');c.execute('update users set password_hash=? where username=?',(get_password_hash(SUPER_ADMIN_PASSWORD),'admin',));c.commit();print('password updated')"
```

> 内置管理员不能在界面上删除。删除整个 `data/` 目录后重启会重建干净骨架（含新的内置管理员），但原有业务数据会一并丢失。

## 项目结构

```text
.
├── README.md                 # 中文说明（本文件）
├── README_EN.md              # English documentation
├── 启动.bat                  # Windows 一键启动脚本
├── .gitignore
├── backend/                  # 后端：Python + FastAPI
│   ├── requirements.txt
│   ├── .env.example          # 环境变量模板（不含真实密钥）
│   ├── init_db.py            # 数据库初始化脚本
│   └── app/
│       ├── main.py           # 应用入口：路由注册、CORS、启动初始化与清理
│       ├── config.py         # 集中配置（端口、数据目录、LLM、JWT、密钥加载）
│       ├── database.py       # SQLAlchemy 连接与建表/轻量迁移
│       ├── models.py         # 7 张 ORM 表定义
│       ├── schemas.py        # 请求/响应模型（Pydantic）
│       ├── auth.py           # 密码哈希、JWT、角色依赖
│       ├── utils/crypto.py   # API Key 加解密
│       ├── crud/             # 数据访问层（user / script / category / invitation_code / pending_script / log）
│       ├── services/         # 业务逻辑（matcher 本地匹配 / ai_service 大模型 / excel_service / cleanup）
│       └── routers/          # 接口层（auth / users / categories / scripts / analyze / pending / upload）
├── frontend/                 # 前端：React + TypeScript + Vite
│   ├── package.json
│   ├── vite.config.ts        # 开发端口 5175、/api 代理
│   └── src/
│       ├── App.tsx           # 路由与全局 Provider
│       ├── api/              # axios 请求封装
│       ├── context/          # 登录态、主题、页面缓存
│       ├── components/       # 通用组件（布局、路由守卫、卡片等）
│       ├── hooks/            # 动效钩子
│       ├── pages/            # 页面组件
│       └── types/            # TypeScript 类型定义
├── deploy/                   # 服务器部署脚本与配置（Nginx + systemd）
└── docs/                     # 设计文档（需求分析 / 架构设计 / 实施计划 / 认证方案）
```

**数据表**：`users`、`invitation_codes`、`categories`、`scripts`、`pending_scripts`、`usage_logs`、`token_usage_logs`（定义见 `backend/app/models.py`）。

运行期自动生成、不纳入版本控制的目录：`data/`（数据库、密钥、上传与导出缓存）、`frontend/node_modules/`、`frontend/dist/`、`__pycache__/`、`.venv/`。

## 数据与备份

- 备份：话术库管理页导出 Excel；更完整的备份是整体复制 `data/` 目录（含数据库与密钥文件）；
- 恢复：导入 Excel，或把备份的 `data/` 放回项目根目录；
- `data/` 完全由程序自动生成：删除后重启会重建干净骨架（内置管理员、默认分类与示例话术），同时旧的业务数据将不可恢复；
- `data/secret.key` 用于 API Key 加密，**丢失后历史加密的 API Key 无法解密**，需各账号重新配置。

## 部署到服务器

仓库 `deploy/` 目录提供 Ubuntu + Nginx + systemd 的部署脚本与配置模板：

```bash
# 将代码放到服务器目标目录后
sudo bash deploy/deploy.sh 8081     # 参数为对外监听端口，按需修改
# 日常更新
git pull && sudo bash deploy/update.sh
```

脚本会依次完成：安装系统依赖 → 创建后端虚拟环境并安装依赖 → 生成 `.env` → 初始化数据库 → 构建前端 → 配置 systemd 服务 → 写入 Nginx 站点 → 配置防火墙。部署前请注意：

- 修改 `backend/app/config.py` 中的内置管理员初始口令；
- 云服务器安全组只需放行你选择的服务端口与 SSH 端口，后端端口仅供本机反代使用；
- 服务器上的 `data/` 是业务数据目录，更新代码时不要覆盖；
- 建议在生产环境启用 HTTPS，并设置独立的 `SECRET_KEY`。

## 常见问题

**Q：页面打不开？**
确认后端与前端都在运行（后端 8002、前端 5175）；若端口被占用，可修改 `frontend/vite.config.ts` 中的 `server.port` 与 `backend/.env` 中的 `PORT`。

**Q：AI 分析没有反应？**
确认已在「API Key 配置」中填入有效 Key（未配置时系统会自动降级为本地匹配并在界面提示），并检查 Key 的额度与网络能否访问所配置的接口地址。

**Q：数据存在哪里？删除 `data/` 会怎样？**
见上文「数据与备份」。删除 `data/` 等于放弃全部业务数据，重启后会重建一套干净的初始数据。

**Q：导入 Excel 很慢？**
导入确认后会并行调用大模型逐条补充分类与关键词（最多 5 个并发任务），数据量大时耗时较长；未配置 API Key 时跳过 AI 补全，仅做基础导入。建议先用少量数据验证格式。

**Q：游客登录的数据会保存吗？**
不会。游客为一次性账号与临时公司，退出时清除全部痕迹，服务重启时也会清理异常残留。

## 已知限制

- 使用 SQLite 单文件存储，适合中小规模使用；`deploy/` 中的 systemd 单元以单 worker 运行以避免多进程写锁冲突，不适合直接横向扩展多实例；
- `frontend/src/pages/ImportExport.tsx` 为独立的导入导出页面组件，当前未挂路由（该能力已内置在话术库管理页工具栏），保留作为参考实现；
- 使用本系统生成或管理的话术内容，请自行确保符合所在地区法律法规与所用平台的服务规则。

## 参与贡献

欢迎提交 Issue 与 Pull Request。

- (待补充：贡献指南 CONTRIBUTING.md)
- (待补充：分支模型 / 提交信息规范 / 代码风格要求)
- (待补充：开发环境搭建与测试方式)

## 许可证

(待补充：本项目尚未添加 LICENSE 文件，许可证类型待定；在明确许可证之前，请勿默认采用任何开源协议)

## 联系方式

- 维护者：(待补充：作者 / 维护者名称)
- 联系方式：(待补充：邮箱或其它公开联系渠道)
- 仓库地址：(待补充：公开仓库地址)
