"""
认证路由：登录、注册、补充公司信息、获取当前用户、游客登录/退出
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import (
    LoginRequest, RegisterRequest, CompleteProfileRequest,
    ApiResponse, UserInfoResponse,
)
from ..models import User
from ..auth import (
    verify_password, get_password_hash, create_access_token,
    get_current_user,
)
from ..crud import user as user_crud
from ..crud import invitation_code as ic_crud
from ..services.cleanup import delete_guest_user_and_traces

router = APIRouter(prefix="/api/auth", tags=["认证"])


@router.post("/login", response_model=ApiResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """用户登录"""
    user = user_crud.get_user_by_username(db, body.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号不存在，请检查用户名或先注册",
        )
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="密码错误，请重试",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已被禁用",
        )

    if user.expires_at and datetime.utcnow() > user.expires_at:
        expired_at = user.expires_at.strftime("%Y-%m-%d %H:%M")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"您的账号已于 {expired_at} 过期，已被禁止登录；请联系公司管理员延长有效时间后重试",
        )

    # 更新最后登录时间
    user_crud.update_last_login(db, user.id)

    # 生成 Token
    access_token = create_access_token(data={"sub": str(user.id)})

    return ApiResponse(
        success=True,
        data={
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "company_name": user.company_name,
                "is_active": user.is_active,
                "expires_at": user.expires_at.isoformat() if user.expires_at else None,
                "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "has_api_key": bool(user.api_key_encrypted),
                "total_tokens_spent": user.total_tokens_spent or 0,
                "needs_company": not bool(user.company_name),
            }
        },
        message="登录成功",
    )


@router.post("/register", response_model=ApiResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """用户注册（需邮箱+邀请码）"""
    # 校验用户名唯一性
    existing_user = user_crud.get_user_by_username(db, body.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="用户名已存在")

    # 校验邮箱唯一性
    existing_email = user_crud.get_user_by_email(db, body.email)
    if existing_email:
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    # 校验邀请码
    code = ic_crud.get_code_by_str(db, body.invitation_code)
    if not code:
        raise HTTPException(status_code=400, detail="邀请码无效")

    if not code.is_active or code.used_by is not None:
        raise HTTPException(status_code=400, detail="邀请码已失效或已被使用")

    if code.expires_at and datetime.utcnow() > code.expires_at:
        raise HTTPException(status_code=400, detail="邀请码已过期")

    # 根据邀请码等级确定角色
    role = "admin" if code.level == 1 else "user"

    # 创建用户（公司名称从邀请码中获取）
    user = user_crud.create_user(
        db,
        username=body.username,
        password=body.password,
        role=role,
        email=body.email,
        company_name=None,  # 公司名称不再从邀请码获取，注册后由用户自行填写
        invitation_code_id=code.id,
        expires_at=code.expires_at,
    )

    # 标记邀请码为已使用
    ic_crud.validate_and_use_code(db, body.invitation_code, user.id)

    return ApiResponse(
        success=True,
        data={
            "user_id": user.id,
            "role": role,
        },
        message=f"注册成功，角色：{'管理员' if role == 'admin' else '用户'}",
    )


@router.post("/complete-profile", response_model=ApiResponse)
def complete_profile(
    body: CompleteProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """注册后完善公司信息：必填公司名称 + 公司数据库密码（用于公司级数据隔离）

    mode：
      - create：新注册公司（仅管理员可创建，且公司必须不存在）
      - join：登录公司（公司必须已存在，校验公司数据库密码后加入）
      - auto：自动判断（公司存在→校验；不存在→仅管理员创建）
    """
    if current_user.company_name:
        raise HTTPException(status_code=400, detail="公司信息已设置，不可修改")

    company_name = body.company_name.strip()
    if not company_name:
        raise HTTPException(status_code=400, detail="公司名称不能为空")

    mode = (body.mode or "auto").lower()
    # 查找该公司是否已有用户（存在即表示公司数据库密码已创建）
    company_user = user_crud.get_company_user_by_name(db, company_name)

    if mode == "create":
        # 新注册公司：仅管理员可创建，且公司必须不存在
        if current_user.role not in ("admin", "super_admin"):
            raise HTTPException(status_code=400, detail="只有管理员才能创建新公司")
        if company_user:
            raise HTTPException(status_code=400, detail="该公司已存在，请选择「登录公司」加入")
        company_password_hash = get_password_hash(body.company_password)
    elif mode == "join":
        # 登录公司：公司必须已存在，校验密码加入
        if not company_user:
            raise HTTPException(status_code=400, detail="该公司不存在或尚未创建数据库密码，请确认公司名称或选择「新注册公司」")
        if not verify_password(body.company_password, company_user.company_password_hash):
            raise HTTPException(status_code=400, detail="公司数据库密码错误，无法加入该公司，请联系公司管理员获取密码")
        company_password_hash = get_password_hash(body.company_password)
    else:
        # auto：公司存在→校验；不存在→仅管理员创建
        if company_user:
            if not verify_password(body.company_password, company_user.company_password_hash):
                raise HTTPException(status_code=400, detail="公司数据库密码错误，无法加入该公司，请联系公司管理员获取密码")
            company_password_hash = get_password_hash(body.company_password)
        else:
            if current_user.role not in ("admin", "super_admin"):
                raise HTTPException(
                    status_code=400,
                    detail="该公司不存在或尚未创建数据库密码，无法加入；只有公司管理员才能创建新公司，请联系公司管理员",
                )
            company_password_hash = get_password_hash(body.company_password)

    current_user.company_name = company_name
    current_user.company_password_hash = company_password_hash
    db.commit()
    return ApiResponse(success=True, message="公司信息设置成功")


@router.get("/me", response_model=ApiResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return ApiResponse(
        success=True,
        data={
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
            "role": current_user.role,
            "company_name": current_user.company_name,
            "is_active": current_user.is_active,
            "expires_at": current_user.expires_at.isoformat() if current_user.expires_at else None,
            "last_login_at": current_user.last_login_at.isoformat() if current_user.last_login_at else None,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
            "has_api_key": bool(current_user.api_key_encrypted),
            "total_tokens_spent": current_user.total_tokens_spent or 0,
            "needs_company": not bool(current_user.company_name),
        }
    )


def _guest_user_payload(user: User) -> dict:
    """构造游客用户信息响应（与 login / me 一致的结构）"""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "company_name": user.company_name,
        "is_active": user.is_active,
        "expires_at": None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "has_api_key": bool(user.api_key_encrypted),
        "total_tokens_spent": user.total_tokens_spent or 0,
        "needs_company": False,
    }


@router.post("/guest-login", response_model=ApiResponse)
def guest_login(db: Session = Depends(get_db)):
    """游客登录：创建一次性游客账号。

    - 每次登录生成独立的游客账号 + 独立公司，数据与其他公司完全隔离
    - 游客可：导入话术 / 使用话术查询 / 自由操作话术库与分类 / 配置 API Key
    - 游客不可：访问用户管理与审核管理
    - 退出登录（guest-logout）时自动清除该游客全部使用痕迹
    """
    # 生成唯一用户名 / 公司名（同名后缀，保证用户名唯一）
    while True:
        suffix = uuid.uuid4().hex[:10]
        username = f"游客_{suffix}"
        if not user_crud.get_user_by_username(db, username):
            break

    guest = User(
        username=username,
        password_hash=get_password_hash(uuid.uuid4().hex),
        role="guest",
        email=None,
        company_name=f"游客_{suffix}",
        company_password_hash=get_password_hash(uuid.uuid4().hex),
        is_active=True,
        expires_at=None,
    )
    db.add(guest)
    db.commit()
    db.refresh(guest)

    access_token = create_access_token(data={"sub": str(guest.id)})
    return ApiResponse(
        success=True,
        data={
            "access_token": access_token,
            "token_type": "bearer",
            "user": _guest_user_payload(guest),
        },
        message="游客登录成功",
    )


@router.post("/guest-logout", response_model=ApiResponse)
def guest_logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """游客退出登录：自动清除该游客的全部使用痕迹。

    清除范围：话术 / 分类 / 使用日志 / 待审核话术 / Token 消耗记录，并删除游客账号。
    非游客调用时仅返回成功，不做任何删除。
    """
    if current_user.role != "guest":
        return ApiResponse(success=True, message="已退出登录")

    stats = delete_guest_user_and_traces(db, current_user)
    return ApiResponse(
        success=True,
        message=(
            f"游客退出成功，已清除全部使用痕迹"
            f"（话术 {stats['scripts_deleted']} / 分类 {stats['categories_deleted']}"
            f" / 日志 {stats['usage_logs_deleted']} / 待审核 {stats['pending_scripts_deleted']}）"
        ),
    )
