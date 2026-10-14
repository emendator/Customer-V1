"""
待审核话术 CRUD 操作
"""
from datetime import datetime
from typing import Optional, List

from sqlalchemy.orm import Session, joinedload

from ..models import PendingScript, Script


def create_pending_script(
    db: Session,
    content: str,
    action: str,
    submitted_by: int,
    company_name: str,
    category_id: Optional[int] = None,
    keywords: str = "",
    target_script_id: Optional[int] = None,
) -> PendingScript:
    """创建待审核话术记录"""
    pending = PendingScript(
        content=content,
        category_id=category_id,
        keywords=keywords,
        action=action,
        target_script_id=target_script_id,
        submitted_by=submitted_by,
        company_name=company_name,
        status="pending",
    )
    db.add(pending)
    db.commit()
    db.refresh(pending)
    return pending


def get_pending_by_id(db: Session, pending_id: int) -> Optional[PendingScript]:
    return db.query(PendingScript).filter(PendingScript.id == pending_id).first()


def get_pending_list(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    company_name: Optional[str] = None,
    action: Optional[str] = None,
) -> tuple:
    """分页查询待审核列表"""
    q = db.query(PendingScript)

    if status:
        q = q.filter(PendingScript.status == status)
    if company_name:
        q = q.filter(PendingScript.company_name == company_name)
    if action:
        q = q.filter(PendingScript.action == action)

    from sqlalchemy.orm import joinedload

    total = q.count()
    items = (
        q.options(
            joinedload(PendingScript.submitted_by_rel),
            joinedload(PendingScript.reviewed_by_rel),
        )
        .order_by(PendingScript.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # 手动构建响应数据（避免序列化问题）
    result = []
    for p in items:
        submitter = p.submitted_by_rel
        reviewer = p.reviewed_by_rel
        category = None
        if p.category_id:
            from ..models import Category
            category = db.query(Category).filter(Category.id == p.category_id).first()

        result.append({
            "id": p.id,
            "content": p.content,
            "category_id": p.category_id,
            "keywords": p.keywords,
            "action": p.action,
            "target_script_id": p.target_script_id,
            "submitted_by": p.submitted_by,
            "company_name": p.company_name,
            "status": p.status,
            "reviewed_by": p.reviewed_by,
            "review_reason": p.review_reason,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
            "submitter_name": submitter.username if submitter else None,
            "reviewer_name": reviewer.username if reviewer else None,
            "category_name": category.name if category else None,
        })

    return total, result


def approve_pending(db: Session, pending_id: int, reviewer_id: int) -> Optional[dict]:
    """
    审核通过：将待审核话术写入正式话术库。
    返回创建的 Script 信息或 None（失败）。
    """
    pending = db.query(PendingScript).filter(
        PendingScript.id == pending_id,
        PendingScript.status == "pending",
    ).first()

    if not pending:
        return None

    script = None
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
            return None
        script.content = pending.content
        script.category_id = pending.category_id
        script.keywords = pending.keywords

    # 更新审核状态
    pending.status = "approved"
    pending.reviewed_by = reviewer_id
    pending.reviewed_at = datetime.utcnow()

    db.commit()
    if script:
        db.refresh(script)

    return {
        "script_id": script.id if script else None,
        "pending_id": pending.id,
    }


def reject_pending(db: Session, pending_id: int, reviewer_id: int, reason: str) -> bool:
    """驳回审核"""
    pending = db.query(PendingScript).filter(
        PendingScript.id == pending_id,
        PendingScript.status == "pending",
    ).first()

    if not pending:
        return False

    pending.status = "rejected"
    pending.reviewed_by = reviewer_id
    pending.review_reason = reason
    pending.reviewed_at = datetime.utcnow()
    db.commit()
    return True
