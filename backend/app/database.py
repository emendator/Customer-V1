from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30} if "sqlite" in DATABASE_URL else {},
    pool_pre_ping=True,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """获取数据库会话的依赖注入"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_migrations():
    """轻量迁移：为已存在的表补充新增列（create_all 不会为已有表加列）"""
    inspector = inspect(engine)
    if "users" in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns("users")}
        # 2026-08-04 新增：公司数据库密码哈希（公司级数据隔离）
        if "company_password_hash" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN company_password_hash VARCHAR(255)"))

    if "invitation_codes" in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns("invitation_codes")}
        # 2026-08-04 新增：删除标记（软删除进回收站，区分主动删除与使用后作废）
        if "deleted_at" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE invitation_codes ADD COLUMN deleted_at DATETIME"))
                # 迁移历史数据：未使用且已作废的邀请码视为「已删除」，补删除标记（使用后作废的必有 used_by）
                conn.execute(text(
                    "UPDATE invitation_codes SET deleted_at = datetime('now') "
                    "WHERE is_active = 0 AND used_by IS NULL"
                ))


def init_db():
    """初始化数据库，创建所有表并执行轻量迁移"""
    Base.metadata.create_all(bind=engine)
    _ensure_migrations()
