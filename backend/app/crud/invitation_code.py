"""
邀请码 CRUD 操作
"""
import secrets
from datetime import datetime
from typing import Optional, List

from sqlalchemy.orm import Session

from ..models import InvitationCode


def _generate_unique_code(db: Session) -> str:
    """生成唯一邀请码（8位大写字母数字组合）"""
    for _ in range(100):  # 防止无限循环
        code = secrets.token_hex(4).upper()
        if not db.query(InvitationCode).filter(InvitationCode.code == code).first():
            return code
    # 极低概率碰撞，换用更长格式
    return secrets.token_hex(6).upper()


def create_invitation_code(
    db: Session,
    level: int,
    company_name: Optional[str],
    created_by: int,
    expires_at: datetime,
) -> InvitationCode:
    """创建邀请码（company_name 由注册用户自行填写）"""
    code_str = _generate_unique_code(db)
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


def get_code_by_str(db: Session, code_str: str) -> Optional[InvitationCode]:
    """按邀请码字符串查询"""
    return db.query(InvitationCode).filter(InvitationCode.code == code_str).first()


def get_code_by_id(db: Session, code_id: int) -> Optional[InvitationCode]:
    return db.query(InvitationCode).filter(InvitationCode.id == code_id).first()


def validate_and_use_code(db: Session, code_str: str, user_id: int) -> InvitationCode:
    """
    验证邀请码有效性并标记为已使用（应用层事务安全）。
    返回 InvitationCode 对象，校验失败时返回 None。
    """
    code = db.query(InvitationCode).filter(
        InvitationCode.code == code_str,
        InvitationCode.is_active == True,
        InvitationCode.used_by == None,
    ).first()

    if not code:
        return None

    if code.expires_at and datetime.utcnow() > code.expires_at:
        return None

    code.used_by = user_id
    code.used_at = datetime.utcnow()
    # 使用后不自动作废：保持可管理状态（标记为已使用），用户可手动删除并放入回收站
    db.commit()
    db.refresh(code)
    return code


def get_codes_by_creator(
    db: Session,
    created_by: int,
    page: int = 1,
    page_size: int = 20,
) -> tuple:
    """获取某用户创建的邀请码列表（默认排除已删除的邀请码）"""
    q = db.query(InvitationCode).filter(InvitationCode.created_by == created_by)
    # 被删除（软删除标记）的邀请码进回收站，不在管理列表显示；使用后作废的仍保留显示「已使用」
    q = q.filter(InvitationCode.deleted_at.is_(None))
    total = q.count()
    items = q.order_by(InvitationCode.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()
    return total, items


def get_codes_paginated(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    level: Optional[int] = None,
    is_active: Optional[bool] = None,
    company_name: Optional[str] = None,
) -> tuple:
    """分页查询所有邀请码（管理员视角）"""
    q = db.query(InvitationCode)

    if level is not None:
        q = q.filter(InvitationCode.level == level)
    if is_active is not None:
        q = q.filter(InvitationCode.is_active == is_active)
    if company_name:
        q = q.filter(InvitationCode.company_name == company_name)
    # 被删除（软删除标记）的邀请码进回收站，不在管理列表显示
    q = q.filter(InvitationCode.deleted_at.is_(None))

    total = q.count()
    items = q.order_by(InvitationCode.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()
    return total, items


def deactivate_code(db: Session, code_id: int) -> bool:
    """删除/作废邀请码（已使用的也可删除，软删除进回收站）"""
    code = get_code_by_id(db, code_id)
    if not code:
        return False
    code.is_active = False
    code.deleted_at = datetime.utcnow()
    db.commit()
    return True
