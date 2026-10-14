"""
待审核话术路由：审核管理
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import ApiResponse, ReviewRequest
from ..models import User
from ..auth import get_current_user, require_role
from ..crud import pending_script as ps_crud

router = APIRouter(prefix="/api/pending-scripts", tags=["审核管理"])

require_admin = require_role("super_admin", "admin")


@router.get("", response_model=ApiResponse)
def list_pending(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """待审核话术列表"""
    # admin 只能看到自己公司的待审核记录
    company_filter = None
    if current_user.role == "admin":
        company_filter = current_user.company_name

    total, items = ps_crud.get_pending_list(
        db,
        page=page,
        page_size=page_size,
        status=status,
        company_name=company_filter,
        action=action,
    )

    return ApiResponse(success=True, data={
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    })


@router.post("/{pending_id}/approve", response_model=ApiResponse)
def approve_pending(
    pending_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """审核通过"""
    result = ps_crud.approve_pending(db, pending_id, current_user.id)
    if not result:
        raise HTTPException(status_code=400, detail="审核失败：待审核记录不存在或已处理")

    return ApiResponse(success=True, data=result, message="审核通过，话术已入库")


@router.post("/{pending_id}/reject", response_model=ApiResponse)
def reject_pending(
    pending_id: int,
    body: ReviewRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """驳回审核"""
    if not body.reason:
        raise HTTPException(status_code=400, detail="驳回原因不能为空")

    ok = ps_crud.reject_pending(db, pending_id, current_user.id, body.reason)
    if not ok:
        raise HTTPException(status_code=400, detail="驳回失败：待审核记录不存在或已处理")

    return ApiResponse(success=True, message="已驳回")
