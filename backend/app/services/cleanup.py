"""
公司数据自动清理服务

需求：当某公司在 users 表中已无任何账号记录（即该公司的所有用户均已被彻底删除）
时，自动删除该公司的：
  - 公司名（业务数据中的 company_name 引用）
  - 对应密码（company_password_hash 仅存在于用户记录上，公司无账号时随之消失，无需额外处理）
  - 对应话术库（scripts / categories / usage_logs / pending_scripts）

判定标准：
  - 已注册 = users 表中存在该公司的任意记录（**含已停用 / 已过期用户**，过期不算被删除）
  - 无注册账号 = users 表中该公司记录全部消失（用户被彻底删除），仅剩业务数据残留
"""
from typing import List, Set

from sqlalchemy.orm import Session

from ..models import User, Script, Category, UsageLog, PendingScript, TokenUsageLog

# 游客角色标识（游客会话为一次性账号，退出登录即删除）
GUEST_ROLE = "guest"


def _distinct_companies(db: Session, model) -> Set[str]:
    """收集某张业务表中出现过的所有公司名"""
    return {
        name
        for (name,) in db.query(model.company_name)
        .filter(model.company_name.isnot(None))
        .distinct()
        .all()
    }


def get_unregistered_companies(db: Session) -> List[str]:
    """找出「没有注册账号」的公司列表。

    逻辑：业务数据（话术/分类/日志/待审核）中出现过，但 users 表中无任何记录的公司。
    """
    # 已注册公司 = users 表中出现过的所有 company_name（含软删除/过期用户，过期不算被删除）
    registered = {
        name
        for (name,) in db.query(User.company_name)
        .filter(User.company_name.isnot(None))
        .distinct()
        .all()
    }

    # 业务数据中出现的所有公司
    companies_in_data: Set[str] = set()
    for model in (Script, Category, UsageLog, PendingScript):
        companies_in_data |= _distinct_companies(db, model)

    # 无注册账号的公司 = 有业务数据残留但 users 表中无任何记录
    return sorted(companies_in_data - registered)


def cleanup_unregistered_companies(db: Session) -> dict:
    """自动清理所有「没有注册账号」公司的业务数据。

    返回清理统计信息：
    {
        "companies": [公司名, ...],
        "scripts_deleted": int,
        "categories_deleted": int,
        "usage_logs_deleted": int,
        "pending_scripts_deleted": int,
    }
    """
    stats = {
        "companies": [],
        "scripts_deleted": 0,
        "categories_deleted": 0,
        "usage_logs_deleted": 0,
        "pending_scripts_deleted": 0,
    }

    orphan_companies = get_unregistered_companies(db)
    if not orphan_companies:
        return stats

    stats["companies"] = orphan_companies

    for company in orphan_companies:
        stats["scripts_deleted"] += db.query(Script).filter(
            Script.company_name == company
        ).delete(synchronize_session=False)
        stats["categories_deleted"] += db.query(Category).filter(
            Category.company_name == company
        ).delete(synchronize_session=False)
        stats["usage_logs_deleted"] += db.query(UsageLog).filter(
            UsageLog.company_name == company
        ).delete(synchronize_session=False)
        stats["pending_scripts_deleted"] += db.query(PendingScript).filter(
            PendingScript.company_name == company
        ).delete(synchronize_session=False)

    db.commit()
    return stats


# ==================== 游客（Guest）清理 ====================

def delete_guest_user_and_traces(db: Session, user: User) -> dict:
    """删除单个游客账号及其全部使用痕迹（退出登录时调用）。

    清除范围：该游客公司下的话术 / 分类 / 使用日志 / 待审核话术，
    以及该游客的 Token 消耗记录，最后删除游客账号本身。
    返回统计信息。
    """
    stats = {
        "scripts_deleted": 0,
        "categories_deleted": 0,
        "usage_logs_deleted": 0,
        "pending_scripts_deleted": 0,
        "token_logs_deleted": 0,
    }

    company = user.company_name
    if company:
        stats["scripts_deleted"] = db.query(Script).filter(
            Script.company_name == company
        ).delete(synchronize_session=False)
        stats["categories_deleted"] = db.query(Category).filter(
            Category.company_name == company
        ).delete(synchronize_session=False)
        stats["usage_logs_deleted"] = db.query(UsageLog).filter(
            UsageLog.company_name == company
        ).delete(synchronize_session=False)
        stats["pending_scripts_deleted"] = db.query(PendingScript).filter(
            PendingScript.company_name == company
        ).delete(synchronize_session=False)

    stats["token_logs_deleted"] = db.query(TokenUsageLog).filter(
        TokenUsageLog.user_id == user.id
    ).delete(synchronize_session=False)

    db.delete(user)
    db.commit()
    return stats


def cleanup_guest_users(db: Session) -> dict:
    """清理所有遗留的游客账号及其数据。

    服务重启后可能残留未正常退出（如直接关闭浏览器）的游客会话，
    启动时统一清除，保证游客痕迹不长期留存。
    """
    stats = {
        "guests_deleted": 0,
        "scripts_deleted": 0,
        "categories_deleted": 0,
        "usage_logs_deleted": 0,
        "pending_scripts_deleted": 0,
        "token_logs_deleted": 0,
    }

    guests = db.query(User).filter(User.role == GUEST_ROLE).all()
    for g in guests:
        s = delete_guest_user_and_traces(db, g)
        stats["guests_deleted"] += 1
        for key in ("scripts_deleted", "categories_deleted", "usage_logs_deleted",
                    "pending_scripts_deleted", "token_logs_deleted"):
            stats[key] += s[key]

    return stats
