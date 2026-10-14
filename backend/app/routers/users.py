"""
用户管理路由：用户列表、邀请码管理、API Key 管理
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import (
    ApiResponse,
    InvitationCodeGenerateRequest,
    UserExpiryUpdate,
    ApiKeyUpdateRequest,
    CompanyPasswordUpdateRequest,
)
from ..models import User, TokenUsageLog
from ..auth import get_current_user, require_role
from ..crud import user as user_crud
from ..crud import invitation_code as ic_crud
from ..utils.crypto import encrypt_api_key, decrypt_api_key

router = APIRouter(prefix="/api", tags=["用户管理"])

require_admin = require_role("super_admin", "admin")
require_super_admin = require_role("super_admin")


# ==================== 用户管理 ====================

@router.get("/users", response_model=ApiResponse)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Optional[str] = Query(None),
    company_name: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(True),  # 默认只显示活跃用户
    keyword: Optional[str] = Query(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """用户列表（管理员以上，默认只显示活跃账号）"""
    # super_admin 看到所有用户，admin 只能看到自己邀请的账号
    if current_user.role == "super_admin":
        company_filter = company_name
        total, items = user_crud.get_users_paginated(
            db, page=page, page_size=page_size, role=role,
            company_name=company_filter, is_active=is_active, keyword=keyword,
        )
    else:
        # admin 只能看到通过自己创建的邀请码注册的账号
        from ..models import InvitationCode
        my_code_ids = [
            c[0] for c in db.query(InvitationCode.id).filter(
                InvitationCode.created_by == current_user.id
            ).all()
        ]
        total, items = user_crud.get_users_paginated(
            db, page=page, page_size=page_size, role=role,
            is_active=is_active, keyword=keyword,
            invitation_code_ids=my_code_ids,
        )

    data = {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "company_name": u.company_name,
                "is_active": u.is_active,
                "expires_at": u.expires_at.isoformat() if u.expires_at else None,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in items
        ],
    }
    return ApiResponse(success=True, data=data)


@router.get("/users/recycle-bin", response_model=ApiResponse)
def list_recycle_bin(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """回收站：查看已删除的账号及关联的邀请码"""
    if current_user.role == "super_admin":
        company_filter = None
        total, items = user_crud.get_users_paginated(
            db, page=page, page_size=page_size,
            is_active=False, company_name=company_filter,
        )
    else:
        # admin 只能看到自己邀请的已删除账号
        from ..models import InvitationCode
        my_code_ids = [
            c[0] for c in db.query(InvitationCode.id).filter(
                InvitationCode.created_by == current_user.id
            ).all()
        ]
        total, items = user_crud.get_users_paginated(
            db, page=page, page_size=page_size,
            is_active=False, invitation_code_ids=my_code_ids,
        )

    # 收集所有关联的邀请码信息
    invite_code_ids = [u.invitation_code_id for u in items if u.invitation_code_id]
    codes_map = {}
    if invite_code_ids:
        from ..models import InvitationCode
        codes = db.query(InvitationCode).filter(InvitationCode.id.in_(invite_code_ids)).all()
        codes_map = {c.id: c for c in codes}

    data = {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "role": u.role,
                "company_name": u.company_name,
                "is_active": u.is_active,
                "invitation_code": codes_map[u.invitation_code_id].code if u.invitation_code_id and u.invitation_code_id in codes_map else None,
                "invitation_code_level": codes_map[u.invitation_code_id].level if u.invitation_code_id and u.invitation_code_id in codes_map else None,
                "deleted_at": u.updated_at.isoformat() if u.updated_at else None,
                "expires_at": u.expires_at.isoformat() if u.expires_at else None,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in items
        ],
    }
    return ApiResponse(success=True, data=data)


@router.get("/invitation-codes/recycle-bin", response_model=ApiResponse)
def list_invitation_codes_recycle_bin(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """回收站：查看已删除的邀请码"""
    from ..models import InvitationCode

    q = db.query(InvitationCode).filter(InvitationCode.deleted_at.isnot(None))

    if current_user.role == "admin":
        q = q.filter(InvitationCode.created_by == current_user.id)

    total = q.count()
    items = q.order_by(InvitationCode.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # 获取创建者信息
    creator_ids = set(c.created_by for c in items if c.created_by)
    creators = {}
    if creator_ids:
        from ..models import User
        users = db.query(User).filter(User.id.in_(creator_ids)).all()
        creators = {u.id: u.username for u in users}

    data = {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": c.id,
                "code": c.code,
                "level": c.level,
                "company_name": c.company_name,
                "created_by": c.created_by,
                "creator_name": creators.get(c.created_by, "未知"),
                "used_by": c.used_by,
                "is_active": c.is_active,
                "expires_at": c.expires_at.isoformat() if c.expires_at else None,
                "used_at": c.used_at.isoformat() if c.used_at else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "deleted_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in items
        ],
    }
    return ApiResponse(success=True, data=data)


@router.delete("/recycle-bin", response_model=ApiResponse)
def clear_recycle_bin(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """清空回收站：永久删除所有已清除的账号和已删除的邀请码"""
    from ..models import InvitationCode

    if current_user.role == "super_admin":
        # 超级管理员清空所有
        user_count = db.query(User).filter(User.is_active == False).delete(synchronize_session=False)
        code_count = db.query(InvitationCode).filter(InvitationCode.deleted_at.isnot(None)).delete(synchronize_session=False)
    else:
        # 管理员只能清空自己邀请的账号
        my_code_ids = [
            c[0] for c in db.query(InvitationCode.id).filter(
                InvitationCode.created_by == current_user.id
            ).all()
        ]
        user_count = 0
        if my_code_ids:
            user_count = db.query(User).filter(
                User.is_active == False,
                User.invitation_code_id.in_(my_code_ids),
            ).delete(synchronize_session=False)
        # 管理员只能清空自己创建的邀请码
        code_count = db.query(InvitationCode).filter(
            InvitationCode.deleted_at.isnot(None),
            InvitationCode.created_by == current_user.id,
        ).delete(synchronize_session=False)

    db.commit()
    return ApiResponse(
        success=True,
        data={"users_deleted": user_count, "codes_deleted": code_count},
        message=f"回收站已清空，共清理 {user_count} 个账号和 {code_count} 个邀请码",
    )


# ==================== API Key 管理（必须在 /users/{user_id} 之前） ====================

@router.put("/users/api-key", response_model=ApiResponse)
def update_api_key(
    body: ApiKeyUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """设置/更新当前用户的 API Key（加密存储）"""
    from ..utils.crypto import encrypt_api_key
    encrypted = encrypt_api_key(body.api_key)
    current_user.api_key_encrypted = encrypted
    db.commit()
    return ApiResponse(success=True, message="API Key 已保存（加密存储）")


@router.put("/users/company-password", response_model=ApiResponse)
def update_company_password(
    body: CompanyPasswordUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """修改公司数据库密码（公司级数据隔离凭据）

    所有管理员（含最高级管理员）均只能修改【当前账号所属公司】的数据库密码，
    不可指定其他公司。修改后该公司所有用户的密码哈希同步更新。
    """
    company = current_user.company_name or ""
    if not company:
        raise HTTPException(status_code=400, detail="请先完善公司信息")

    # 校验该公司存在（有已设置密码的用户）
    company_user = user_crud.get_company_user_by_name(db, company)
    if not company_user:
        raise HTTPException(status_code=404, detail="该公司不存在或尚未创建数据库密码，无法修改")

    count = user_crud.update_company_password(db, company, body.company_password)
    return ApiResponse(
        success=True,
        message=f"公司「{company}」的数据库密码已更新（影响 {count} 个账号）",
    )


@router.get("/users/api-key-status", response_model=ApiResponse)
def get_api_key_status(
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的 API Key 状态（不返回完整 Key）"""
    from ..utils.crypto import decrypt_api_key
    has_key = bool(current_user.api_key_encrypted)
    mask = ""
    if has_key:
        raw = decrypt_api_key(current_user.api_key_encrypted)
        if len(raw) > 8:
            mask = raw[:4] + "****" + raw[-4:]
        else:
            mask = "****"
    return ApiResponse(success=True, data={
        "has_key": has_key,
        "mask": mask,
        "total_tokens_spent": current_user.total_tokens_spent or 0,
    })


@router.get("/users/token-usage", response_model=ApiResponse)
def get_token_usage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户的 Token 消耗统计"""
    from sqlalchemy import func
    from datetime import timedelta
    total = db.query(func.sum(TokenUsageLog.total_tokens)).filter(
        TokenUsageLog.user_id == current_user.id
    ).scalar() or 0
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    daily = db.query(
        func.date(TokenUsageLog.created_at).label("date"),
        func.sum(TokenUsageLog.total_tokens).label("tokens"),
    ).filter(
        TokenUsageLog.user_id == current_user.id,
        TokenUsageLog.created_at >= thirty_days_ago,
    ).group_by(func.date(TokenUsageLog.created_at)).order_by(
        func.date(TokenUsageLog.created_at)
    ).all()
    return ApiResponse(success=True, data={
        "total_tokens": total,
        "daily_usage": [{"date": str(row.date), "tokens": row.tokens} for row in daily],
    })


@router.get("/users/{user_id}", response_model=ApiResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """用户详情"""
    user = user_crud.get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 权限校验：admin 只能看自己公司的用户
    if current_user.role == "admin" and user.company_name != current_user.company_name:
        raise HTTPException(status_code=403, detail="权限不足")

    return ApiResponse(success=True, data={
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "company_name": user.company_name,
        "is_active": user.is_active,
        "expires_at": user.expires_at.isoformat() if user.expires_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    })


@router.delete("/users/{user_id}", response_model=ApiResponse)
def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """删除用户（含级联删除）—— 仅在账号过期后可删除"""
    target = user_crud.get_user_by_id(db, user_id)
    if not target or not target.is_active:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 不能删除自己
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")

    # 有效期保护：未过期的账号不可删除
    if target.expires_at and target.expires_at > datetime.utcnow():
        raise HTTPException(status_code=400, detail="账号仍在有效期内，不可删除，请等待过期后再操作")
    if not target.expires_at:
        raise HTTPException(status_code=400, detail="该账号永不过期，不可删除")

    # 权限校验
    if current_user.role == "super_admin":
        if target.role == "super_admin":
            raise HTTPException(status_code=400, detail="不能删除最高级管理员")
        if target.role == "admin":
            # 级联删除管理员及其下属用户
            result = user_crud.cascade_delete_admin(db, user_id)
            if result["admin_deleted"]:
                return ApiResponse(
                    success=True,
                    data=result,
                    message=f"管理员账号已清除，关联的 {result['users_deleted']} 个用户账号同步清除",
                )
            raise HTTPException(status_code=400, detail="删除管理员失败")
    else:
        # admin 只能删除自己公司下的 user
        if target.role != "user":
            raise HTTPException(status_code=403, detail="管理员只能删除普通用户")
        if target.company_name != current_user.company_name:
            raise HTTPException(status_code=403, detail="不能删除其他公司的用户")

        # admin 删除普通用户也需检查有效期
        if target.expires_at and target.expires_at > datetime.utcnow():
            raise HTTPException(status_code=400, detail="账号仍在有效期内，不可删除")
        if not target.expires_at:
            raise HTTPException(status_code=400, detail="该账号永不过期，不可删除")

    ok = user_crud.delete_user(db, user_id)
    if not ok:
        raise HTTPException(status_code=400, detail="删除失败")
    return ApiResponse(success=True, message="用户已清除")


@router.put("/users/{user_id}/expiry", response_model=ApiResponse)
def update_user_expiry(
    user_id: int,
    body: UserExpiryUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """设置/修改用户过期时间——仅在账号已过期或无过期时间时可操作"""
    target = user_crud.get_user_by_id(db, user_id)
    if not target or not target.is_active:
        raise HTTPException(status_code=404, detail="用户不存在")

    if target.role == "super_admin":
        raise HTTPException(status_code=400, detail="不能修改最高级管理员的过期时间")

    if current_user.role == "admin" and target.company_name != current_user.company_name:
        raise HTTPException(status_code=403, detail="权限不足")

    if current_user.role == "admin" and target.role == "admin":
        raise HTTPException(status_code=403, detail="管理员不能修改其他管理员的过期时间")

    # 有效期保护：未过期的账号不可修改过期时间
    if target.expires_at and target.expires_at > datetime.utcnow():
        raise HTTPException(status_code=400, detail="账号仍在有效期内，不可修改过期时间，请等待过期后再操作")

    user_crud.update_user(db, user_id, expires_at=body.expires_at)
    return ApiResponse(success=True, message="过期时间已更新")


# ==================== 邀请码管理 ====================

@router.post("/invitation-codes/generate", response_model=ApiResponse)
def generate_invitation_code(
    body: InvitationCodeGenerateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """生成邀请码"""
    # 权限校验
    if body.level == 1 and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="只有最高级管理员才能生成一级邀请码")

    code = ic_crud.create_invitation_code(
        db,
        level=body.level,
        company_name=None,  # 公司名称不再由创建者指定，注册后由用户自行填写
        created_by=current_user.id,
        expires_at=body.expires_at,
    )

    return ApiResponse(
        success=True,
        data={
            "id": code.id,
            "code": code.code,
            "level": code.level,
            "company_name": code.company_name,
            "expires_at": code.expires_at.isoformat() if code.expires_at else None,
        },
        message=f"邀请码生成成功（{'管理员' if body.level == 1 else '用户'}）",
    )


@router.get("/invitation-codes", response_model=ApiResponse)
def list_invitation_codes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    level: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """邀请码列表"""
    # admin 只能看自己创建的邀请码
    if current_user.role == "admin":
        total, items = ic_crud.get_codes_by_creator(db, current_user.id, page, page_size)
    else:
        total, items = ic_crud.get_codes_paginated(
            db, page, page_size, level=level, is_active=is_active
        )

    # 获取创建者/使用人用户名
    user_ids = set(c.created_by for c in items if c.created_by)
    user_ids |= set(c.used_by for c in items if c.used_by)
    users = {u.id: u.username for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    data = {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": c.id,
                "code": c.code,
                "level": c.level,
                "company_name": c.company_name,
                "created_by": c.created_by,
                "creator_name": users.get(c.created_by, "未知"),
                "used_by": c.used_by,
                "used_by_name": users.get(c.used_by, "") if c.used_by else None,
                "is_active": c.is_active,
                "expires_at": c.expires_at.isoformat() if c.expires_at else None,
                "used_at": c.used_at.isoformat() if c.used_at else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in items
        ],
    }
    return ApiResponse(success=True, data=data)


@router.delete("/invitation-codes/{code_id}", response_model=ApiResponse)
def deactivate_invitation_code(
    code_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """删除/作废邀请码（已使用的也可删除）"""
    code = ic_crud.get_code_by_id(db, code_id)
    if not code:
        raise HTTPException(status_code=404, detail="邀请码不存在")

    # admin 只能删除自己创建的
    if current_user.role == "admin" and code.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="权限不足")

    ok = ic_crud.deactivate_code(db, code_id)
    if not ok:
        raise HTTPException(status_code=400, detail="删除失败")
    return ApiResponse(success=True, message="邀请码已删除")
