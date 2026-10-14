# 💬 Smart CS Assist

> 🌐 Language / 语言：[**中文 → README.md**](README.md) · **English**（this file）
>
> Badges: (TBD: build status / license / version badges)

## Overview

**Smart CS Assist** is an AI-assisted reply tool for customer-service agents. Paste a customer's question, and the system returns several ready-to-send replies; the replies your team actually adopts accumulate into a shared, company-scoped script library. The more it is used, the richer the library becomes.

- **Local matching (default, works offline)**: jieba tokenization + TF-IDF cosine similarity over your own company's script library. No external service and no API key required.
- **AI mode (optional)**: connect any OpenAI-compatible endpoint to generate replies tagged with angle/tone, produce standard process scripts for common support scenarios, and auto-fill categories and keywords for bulk-imported scripts.

Typical use cases: after-sales support on e-commerce or messaging channels, maintaining a company's standard support scripts, and training new support staff.

## Features

| Area | Capability |
| ------ | ------ |
| Workbench | Paste the customer's question → choose a category → analyze → get several candidate replies with copy / adopt / 👍👎 rating; page state is cached so switching pages does not re-trigger requests |
| Script library | Keyword search, spreadsheet-style column filters, create/edit/delete, bulk delete and bulk add, enable/disable, usage and rating counters |
| Excel import/export | Upload `.xlsx/.xls/.csv` with column mapping and an append/dedupe strategy, then confirm the import; export everything, the current filter, or selected rows; import template provided |
| Categories | Two-level category tree (group → sub-category) with script counts; 8 top-level categories ship by default |
| Review workflow | Scripts created or edited by regular users go into an approval queue; admins approve or reject (a rejection reason is required) |
| Users & invite codes | Three roles, invite-code registration, account expiry, recycle bin for removed accounts and deleted invite codes |
| Guest mode | One-click guest entry with a disposable account and a temporary company; all traces are removed on exit |
| Multi-company isolation | One shared library and category tree per company, fully isolated between companies; joining a company requires its company password |
| Credential storage | Per-account API keys, encrypted with AES-256-GCM + PBKDF2 before being stored; never kept in plaintext or written to `.env` |
| Token accounting | Every AI call is recorded and accumulated per account |
| UI | React + Ant Design 5, dark/light themes (dark by default), responsive layout and interaction effects |

> Note: the first result of every analysis is a reassuring "no anomaly" script from the same category. Like any other script, it can be maintained or deleted in the script library.

## Tech Stack

| Layer | Technology |
| ------ | ------ |
| Frontend | React 18 + TypeScript 5 |
| UI / build | Ant Design 5, Vite 5, axios, react-router-dom 6 |
| Backend | Python + FastAPI (uvicorn) |
| ORM / database | SQLAlchemy 2 + SQLite (single file, no database server to install) |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Credential encryption | cryptography (AES-256-GCM + PBKDF2-HMAC-SHA256) |
| Chinese text matching | jieba + scikit-learn (TF-IDF / cosine similarity) |
| Excel | pandas + openpyxl |
| LLM | openai SDK (OpenAI-compatible endpoint; the default configuration points to DeepSeek) |

## Architecture

```text
┌──────────────────────────────────────────────┐
│ Browser: React SPA (dev port 5175)            │
│ axios attaches JWT automatically → /api/*     │
└───────────────────────┬──────────────────────┘
                        │ Vite dev proxy / Nginx reverse proxy
                        ▼
┌──────────────────────────────────────────────┐
│ Backend: FastAPI (default port 8002)          │
│ backend/app                                   │
│ routers → crud → models                       │
│ services: matcher / ai_service / excel        │
└──────┬───────────────────────┬───────────────┘
       ▼                       ▼
  SQLite database        OpenAI-compatible LLM API
  data/smart_cs.db      (optional; falls back to local matching without a key)
```

- All business data (accounts, companies, categories, scripts, logs, reviews, token usage) lives in `data/smart_cs.db`;
- Uploaded Excel files go to `data/uploads/`; exported files and templates go to `data/output/`;
- The encryption and signing key is stored in `data/secret.key` (generated automatically; if lost, previously encrypted API keys can no longer be decrypted).

## Getting Started

### Requirements

- Python 3.10+ (the Windows one-click script supports 3.10 – 3.13)
- Node.js 18+
- No separate database installation

### Option 1: one-click start on Windows

Double-click **`启动.bat`** in the project root. It checks for Python / Node.js, creates `backend/.env` if missing, installs dependencies, initializes the database, starts the backend (8002) and the frontend (5175), and opens the browser once the health check passes. Close the two console windows to stop the services.

### Option 2: manual start (cross-platform)

Backend:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python init_db.py                     # first-time database init (the app also initializes on startup)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8002
```

Frontend (a second terminal):

```bash
cd frontend
npm install
npm run dev        # http://localhost:5175, /api proxied to :8002
```

Production build: `npm run build` (output in `frontend/dist/`). Interactive API documentation is served at `http://localhost:8002/docs` once the backend is running.

### First run

1. Open `http://localhost:5175`;
2. To explore quickly, click **Guest login** — no registration needed (temporary data, removed on exit);
3. For real use, register with an invite code → fill in the company name and company password (create a new company or join an existing one) → enter the workbench;
4. Optional AI setup: click your username in the top-right corner → **API Key** → paste a key issued by your model provider.

> ⚠️ On first start the system creates a built-in super-admin account; its username and initial password are defined in `backend/app/config.py`. **Change that initial password before deploying anywhere** — do not keep the value shipped in the repository.

## Configuration

Configuration lives in `backend/.env` (copy it from `backend/.env.example`; the repository contains no real credentials).

| Variable | Description |
| ------ | ------ |
| `LLM_BASE_URL` | OpenAI-compatible endpoint, default `https://api.deepseek.com` |
| `LLM_MODEL` | Model name; the example value in `.env.example` is `deepseek-v4-flash` |
| `ADMIN_API_KEY` | Optional. Written once when the built-in super admin is first created; leave empty to skip |
| `HOST` / `PORT` | Backend bind address and port, default `0.0.0.0` / `8002` |
| `DEBUG` | Debug switch, default `true` |
| `DATABASE_URL` | Leave empty to use the default `data/smart_cs.db` |
| `DATA_DIR` | Data directory, defaults to `data/` in the project root |
| `SECRET_KEY` | Key used for credential encryption and JWT signing. When unset, a random key is generated and saved to `data/secret.key` (do not delete it; after changing it, previously encrypted API keys must be reconfigured) |
| `SUPER_ADMIN_COMPANY_PASSWORD` | Initial company password of the built-in super admin's company |
| `SQLITE_TIMEOUT` | SQLite timeout in seconds, default 30 |

> Per-account API keys are stored encrypted in the database — they are **not** configured through `.env` and are never shipped with the repository.

## Usage

| Page | Route | Description |
| ------ | ------ | ------ |
| Login / register | `/login`, `/register` | Login, guest login, invite-code registration |
| Complete company profile | `/complete-profile` | Create or join a company (company password is verified) |
| Workbench | `/workbench` | Core page: enter the customer's question, pick a category, analyze, adopt and copy |
| Script library | `/scripts` | Search and filter, CRUD, bulk operations, Excel import/export |
| Categories | `/categories` | Two-level category management (admins and guests can write; regular users are read-only) |
| Users | `/users` | Accounts, invite codes, recycle bin, company password (admin and above) |
| Review | `/pending` | Approve or reject pending scripts (admin and above) |
| API Key | `/api-key` | Configure the model key and view accumulated token usage |

**Roles and permissions**

| Role | How to get it | Scripts | Categories | Review | Users / invites |
| ------ | ------ | :------: | :------: | :------: | :------: |
| Super admin | Built in, fixed, cannot be deleted | Full CRUD | ✅ | ✅ | ✅ all users |
| Admin | Registered with a level-1 invite code | CRUD within own company | ✅ own company | ✅ own company | ✅ accounts they invited |
| User | Registered with a level-2 invite code | Read; create/edit requires review | Read-only | ❌ | ❌ |
| Guest | One-click guest login | CRUD on temporary data | ✅ | ❌ | ❌ |

## Project Structure

```text
.
├── README.md                 # Chinese documentation
├── README_EN.md              # This file (English documentation)
├── 启动.bat                  # Windows one-click start script
├── .gitignore
├── backend/                  # Backend: Python + FastAPI
│   ├── requirements.txt
│   ├── .env.example          # Environment template (no real credentials)
│   ├── init_db.py            # Database initialization script
│   └── app/
│       ├── main.py           # App entry: routers, CORS, startup initialization and cleanup
│       ├── config.py         # Central configuration (ports, data dir, LLM, JWT, key loading)
│       ├── database.py       # SQLAlchemy engine, table creation and light migrations
│       ├── models.py         # 7 ORM table definitions
│       ├── schemas.py        # Request/response models (Pydantic)
│       ├── auth.py           # Password hashing, JWT, role dependencies
│       ├── utils/crypto.py   # API key encryption/decryption
│       ├── crud/             # Data access layer (user / script / category / invitation_code / pending_script / log)
│       ├── services/         # Business logic (matcher / ai_service / excel_service / cleanup)
│       └── routers/          # HTTP layer (auth / users / categories / scripts / analyze / pending / upload)
├── frontend/                 # Frontend: React + TypeScript + Vite
│   ├── package.json
│   ├── vite.config.ts        # Dev port 5175, /api proxy
│   └── src/
│       ├── App.tsx           # Routing and global providers
│       ├── api/              # axios request wrappers
│       ├── context/          # Auth, theme and page-cache state
│       ├── components/       # Shared components (layout, route guard, cards)
│       ├── hooks/            # Animation hooks
│       ├── pages/            # Page components
│       └── types/            # TypeScript type definitions
├── deploy/                   # Server deployment scripts and config (Nginx + systemd)
└── docs/                     # Design documents (requirements, architecture, plans, auth)
```

**Database tables**: `users`, `invitation_codes`, `categories`, `scripts`, `pending_scripts`, `usage_logs`, `token_usage_logs` (see `backend/app/models.py`).

Generated at runtime and not tracked by Git: `data/` (database, key, upload/export caches), `frontend/node_modules/`, `frontend/dist/`, `__pycache__/`, `.venv/`.

## Data and Backup

- Backup: export scripts to Excel from the script library page; a more complete backup is copying the whole `data/` directory (database plus key file);
- Restore: import the Excel file, or put the backed-up `data/` back into the project root;
- `data/` is generated entirely by the application: deleting it and restarting rebuilds a clean skeleton (built-in admin, default categories, sample scripts), and the previous business data is gone;
- `data/secret.key` protects the stored API keys — **if it is lost, previously encrypted API keys cannot be decrypted** and each account must configure its key again.

## Deployment

The `deploy/` directory contains Ubuntu + Nginx + systemd scripts and configuration templates:

```bash
# after placing the code in the target directory on the server
sudo bash deploy/deploy.sh 8081     # argument = public listening port, adjust as needed
# routine updates
git pull && sudo bash deploy/update.sh
```

The script installs system dependencies, creates the backend virtual environment, generates `.env`, initializes the database, builds the frontend, configures the systemd service and the Nginx site, and sets up the firewall. Before deploying:

- change the built-in admin's initial password in `backend/app/config.py`;
- open only the service port you chose and SSH in the cloud security group — the backend port is only used by the local reverse proxy;
- keep the server's `data/` directory intact when updating code;
- enable HTTPS in production and set an explicit `SECRET_KEY`.

## FAQ

**The page will not open.**
Make sure both services are running (backend on 8002, frontend on 5175). If a port is taken, change `server.port` in `frontend/vite.config.ts` and `PORT` in `backend/.env`.

**AI analysis does nothing.**
Check that a valid key is saved under "API Key" (without one, the system falls back to local matching and says so in the UI), and verify the key's quota and network access to the configured endpoint.

**Where is the data, and what happens if I delete `data/`?**
See "Data and Backup". Deleting `data/` discards all business data; a clean initial dataset is rebuilt on the next start.

**Excel import is slow.**
After confirmation, the importer calls the LLM in parallel to fill in categories and keywords (up to 5 concurrent tasks), which takes time for large files. Without an API key this step is skipped and only the basic import runs. Test with a small file first.

**Is guest data saved?**
No. Guests get a disposable account and a temporary company; everything is removed on exit, and leftovers are cleaned up when the service restarts.

## Known Limitations

- SQLite single-file storage suits small to medium deployments; the systemd unit in `deploy/` runs a single worker to avoid multi-process write-lock conflicts, so it is not designed for multi-instance horizontal scaling;
- `frontend/src/pages/ImportExport.tsx` is a standalone import/export page component that is currently not routed (the feature is built into the script library toolbar) and is kept as a reference implementation;
- You are responsible for ensuring that scripts generated or managed with this system comply with the laws of your jurisdiction and the rules of the platforms you use.

## Contributing

Issues and pull requests are welcome.

- (TBD: CONTRIBUTING.md)
- (TBD: branch model / commit message conventions / code style requirements)
- (TBD: development setup and how to run tests)

## License

(TBD: no LICENSE file yet and the license is undecided — do not assume any open-source license until one is added)

## Contact

- Maintainer: (TBD: author / maintainer name)
- Contact: (TBD: public email or other contact channel)
- Repository: (TBD: public repository URL)
