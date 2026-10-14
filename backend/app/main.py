import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import init_db, SessionLocal
from init_db import init_default_data
from .services.cleanup import cleanup_unregistered_companies, cleanup_guest_users
from .routers import categories, scripts, analyze, upload, auth, users, pending

app = FastAPI(
    title="智能客服话术库系统",
    description="AI-powered Customer Service Script Management System",
    version="1.0.0",
)

# 全局异常捕获，防止未处理异常导致服务崩溃
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"success": False, "detail": f"服务器内部错误: {str(exc)}"},
    )

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(categories.router)
app.include_router(scripts.router)
app.include_router(analyze.router)
app.include_router(upload.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(pending.router)


@app.on_event("startup")
def on_startup():
    """应用启动时初始化数据库。

    先建表，再重建系统骨架（admin 账号、默认分类、示例话术）。
    这样即使删除 data/ 目录，重启后也会自动重建完整骨架，项目不因此出问题。

    随后自动清理「没有注册账号」公司的数据（公司名 / 密码 / 话术库）。
    """
    init_db()
    init_default_data()
    print("✅ 数据库初始化完成")

    # ===== 自动清理：公司无注册账号时，删除其公司名/密码/话术库数据 =====
    db = SessionLocal()
    try:
        stats = cleanup_unregistered_companies(db)
        if stats["companies"]:
            print(
                f"🧹 已自动清理「无注册账号」公司数据：{len(stats['companies'])} 家公司"
                f"（话术 {stats['scripts_deleted']} / 分类 {stats['categories_deleted']}"
                f" / 日志 {stats['usage_logs_deleted']} / 待审核 {stats['pending_scripts_deleted']}）"
            )
            print(f"   公司列表：{', '.join(stats['companies'])}")
        else:
            print("🧹 无需清理「无注册账号」的公司数据")

        # ===== 自动清理：残留的游客会话（服务重启后未正常退出的游客） =====
        gstats = cleanup_guest_users(db)
        if gstats["guests_deleted"]:
            print(
                f"🧹 已清理残留游客会话：{gstats['guests_deleted']} 个游客账号"
                f"（话术 {gstats['scripts_deleted']} / 分类 {gstats['categories_deleted']}"
                f" / 日志 {gstats['usage_logs_deleted']} / 待审核 {gstats['pending_scripts_deleted']}"
                f" / Token记录 {gstats['token_logs_deleted']}）"
            )
    finally:
        db.close()


@app.get("/api/health")
def health_check():
    """健康检查"""
    return {"status": "ok", "service": "智能客服话术库系统"}
