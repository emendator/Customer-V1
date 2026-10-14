"""
用户 CRUD 操作
"""
from datetime import datetime
from typing import Optional, List

from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..models import User, InvitationCode
from ..auth import get_password_hash


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def create_user(
    db: Session,
    username: str,
    password: str,
    role: str = "user",
    email: Optional[str] = None,
    company_name: Optional[str] = None,
    invitation_code_id: Optional[int] = None,
    expires_at: Optional[datetime] = None,
) -> User:
    user = User(
        username=username,
        password_hash=get_password_hash(password),
        email=email,
        role=role,
        company_name=company_name,
        invitation_code_id=invitation_code_id,
        expires_at=expires_at,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user_id: int, **kwargs) -> Optional[User]:
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(user, key):
            setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: int) -> bool:
    """删除用户（逻辑删除：设置 is_active=False，同步作废其使用的邀请码）"""
    user = get_user_by_id(db, user_id)
    if not user:
        return False

    # 作废该用户使用的邀请码
    if user.invitation_code_id:
        db.query(InvitationCode).filter(
            InvitationCode.id == user.invitation_code_id,
            InvitationCode.is_active == True,
        ).update({"is_active": False}, synchronize_session=False)

    user.is_active = False
    db.commit()
    return True


def hard_delete_user(db: Session, user_id: int) -> bool:
    """物理删除用户"""
    user = get_user_by_id(db, user_id)
    if not user:
        return False
    db.delete(user)
    db.commit()
    return True


def cascade_delete_admin(db: Session, admin_id: int) -> dict:
    """
    级联删除管理员及其下属所有用户。
    返回 { 'admin_deleted': bool, 'users_deleted': int }
    """
    admin = get_user_by_id(db, admin_id)
    if not admin or admin.role != "admin":
        return {"admin_deleted": False, "users_deleted": 0}

    company = admin.company_name

    # 查出将被删除的用户（用于后续作废其使用的邀请码）
    users_to_delete = db.query(User).filter(
        User.company_name == company,
        User.role == "user",
        User.is_active == True,
    ).all()
    user_ids = [u.id for u in users_to_delete]
    invite_code_ids = [u.invitation_code_id for u in users_to_delete if u.invitation_code_id]

    # 删除该公司下所有普通用户
    users_deleted = db.query(User).filter(
        User.id.in_(user_ids),
    ).update({"is_active": False}, synchronize_session=False)

    # 作废被删除用户所使用的邀请码
    if invite_code_ids:
        db.query(InvitationCode).filter(
            InvitationCode.id.in_(invite_code_ids),
            InvitationCode.is_active == True,
        ).update({"is_active": False}, synchronize_session=False)

    # 作废该管理员创建的邀请码
    db.query(InvitationCode).filter(
        InvitationCode.created_by == admin_id,
        InvitationCode.is_active == True,
    ).update({"is_active": False}, synchronize_session=False)

    # 作废管理员本人使用的邀请码
    if admin.invitation_code_id:
        db.query(InvitationCode).filter(
            InvitationCode.id == admin.invitation_code_id,
            InvitationCode.is_active == True,
        ).update({"is_active": False}, synchronize_session=False)

    # 删除管理员本身
    admin.is_active = False

    db.commit()
    return {"admin_deleted": True, "users_deleted": users_deleted}


def get_users_paginated(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    role: Optional[str] = None,
    company_name: Optional[str] = None,
    is_active: Optional[bool] = None,
    keyword: Optional[str] = None,
    invitation_code_ids: Optional[List[int]] = None,
) -> tuple:
    """分页查询用户列表"""
    q = db.query(User)

    if role:
        q = q.filter(User.role == role)
    if company_name:
        q = q.filter(User.company_name == company_name)
    if is_active is not None:
        q = q.filter(User.is_active == is_active)
    if keyword:
        q = q.filter(
            or_(
                User.username.contains(keyword),
                User.email.contains(keyword),
                User.company_name.contains(keyword),
            )
        )
    if invitation_code_ids is not None:
        if invitation_code_ids:
            q = q.filter(User.invitation_code_id.in_(invitation_code_ids))
        else:
            # 没有任何邀请码ID，返回空结果
            q = q.filter(User.id == -1)  # 永假条件

    total = q.count()
    items = q.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return total, items


def get_users_by_company(db: Session, company_name: str) -> List[User]:
    """获取同一公司的所有用户"""
    return db.query(User).filter(
        User.company_name == company_name,
        User.is_active == True,
    ).all()


def update_last_login(db: Session, user_id: int):
    """更新最后登录时间"""
    user = get_user_by_id(db, user_id)
    if user:
        user.last_login_at = datetime.now()
        db.commit()


def get_company_user_by_name(db: Session, company_name: str) -> Optional[User]:
    """返回该公司下任意一个已设置公司数据库密码的用户（用于校验公司密码）"""
    return db.query(User).filter(
        User.company_name == company_name,
        User.company_password_hash.isnot(None),
    ).first()


def update_company_password(db: Session, company_name: str, new_password: str) -> int:
    """修改公司数据库密码：同步更新该公司所有用户的 company_password_hash（同一明文，各自加盐）"""
    new_hash = get_password_hash(new_password)
    count = db.query(User).filter(User.company_name == company_name).update(
        {"company_password_hash": new_hash}, synchronize_session=False
    )
    db.commit()
    return count
