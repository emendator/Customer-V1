from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List

from ..database import get_db
from ..schemas import (
    ScriptCreate, ScriptUpdate, ScriptResponse, ScriptListResponse,
    ScriptSearchParams, ApiResponse, ScriptBatchCreate
)
from ..crud import script as script_crud, pending_script as ps_crud
from ..models import Script, User
from ..auth import get_current_user, require_role

router = APIRouter(prefix="/api/scripts", tags=["话术管理"])


def _script_to_response(s: Script) -> dict:
    """将 Script 模型转为响应字典"""
    category_name = s.category.name if s.category else None
    parent_name = None
    if s.category:
        parent_cat = s.category.parent
        # parent 可能是 InstrumentedList（backref 问题），安全处理
        if parent_cat is not None and hasattr(parent_cat, 'name'):
            parent_name = parent_cat.name
    return {
        "id": s.id,
        "content": s.content,
        "category_id": s.category_id,
        "keywords": s.keywords,
        "usage_count": s.usage_count,
        "rating_good": s.rating_good,
        "rating_bad": s.rating_bad,
        "source": s.source,
        "is_active": s.is_active,
        "company_name": s.company_name,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        "category_name": category_name,
        "parent_category_name": parent_name,
    }


@router.get("", response_model=ApiResponse)
def list_scripts(
    keyword: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """话术列表（分页+搜索+筛选，按公司隔离）"""
    company_name = current_user.company_name if current_user.role != "super_admin" else None
    total, items = script_crud.get_scripts(
        db, keyword=keyword, category_id=category_id,
        is_active=is_active, page=page, page_size=page_size,
        company_name=company_name,
    )
    data = {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_script_to_response(s) for s in items]
    }
    return ApiResponse(success=True, data=data)


@router.get("/{script_id}", response_model=ApiResponse)
def get_script(
    script_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """话术详情"""
    s = script_crud.get_script_by_id(db, script_id)
    if not s:
        raise HTTPException(status_code=404, detail="话术不存在")
    # 公司隔离
    if current_user.role != "super_admin" and s.company_name != current_user.company_name:
        raise HTTPException(status_code=403, detail="权限不足")
    return ApiResponse(success=True, data=_script_to_response(s))


@router.post("", response_model=ApiResponse)
def create_script(
    body: ScriptCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """新增话术（普通用户需提交审核）"""
    if current_user.role == "user":
        # 普通用户提交审核
        ps_crud.create_pending_script(
            db,
            content=body.content,
            category_id=body.category_id,
            keywords=body.keywords,
            action="create",
            submitted_by=current_user.id,
            company_name=current_user.company_name,
        )
        return ApiResponse(success=True, message="已提交审核，等待管理员批准")

    s = script_crud.create_script(
        db, content=body.content, category_id=body.category_id,
        keywords=body.keywords, source=body.source,
        company_name=current_user.company_name,
    )
    return ApiResponse(success=True, data={"id": s.id}, message="创建成功")


@router.post("/batch", response_model=ApiResponse)
def batch_create(
    body: ScriptBatchCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """批量新增话术（普通用户需提交审核）"""
    if current_user.role == "user":
        count = 0
        for item in body.items:
            ps_crud.create_pending_script(
                db,
                content=item.content,
                category_id=item.category_id,
                keywords=item.keywords,
                action="create",
                submitted_by=current_user.id,
                company_name=current_user.company_name,
            )
            count += 1
        return ApiResponse(success=True, message=f"已提交 {count} 条话术审核，等待管理员批准")

    items = [item.model_dump() for item in body.items]
    for item in items:
        item["company_name"] = current_user.company_name
    scripts = script_crud.batch_create_scripts(db, items)
    return ApiResponse(success=True, data={"count": len(scripts)}, message=f"成功创建{len(scripts)}条")


@router.put("/{script_id}", response_model=ApiResponse)
def update_script(
    script_id: int,
    body: ScriptUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """编辑话术（普通用户需提交审核）"""
    # 校验话术是否存在及权限
    s = script_crud.get_script_by_id(db, script_id)
    if not s:
        raise HTTPException(status_code=404, detail="话术不存在")

    if current_user.role != "super_admin" and s.company_name != current_user.company_name:
        raise HTTPException(status_code=403, detail="权限不足")

    if current_user.role == "user":
        # 普通用户提交审核
        ps_crud.create_pending_script(
            db,
            content=body.content or s.content,
            category_id=body.category_id if body.category_id is not None else s.category_id,
            keywords=body.keywords if body.keywords is not None else s.keywords,
            action="update",
            target_script_id=script_id,
            submitted_by=current_user.id,
            company_name=current_user.company_name,
        )
        return ApiResponse(success=True, message="已提交修改审核，等待管理员批准")

    update_data = body.model_dump(exclude_none=True)
    s = script_crud.update_script(db, script_id, **update_data)
    if not s:
        raise HTTPException(status_code=404, detail="话术不存在")
    return ApiResponse(success=True, data={"id": s.id}, message="更新成功")


@router.put("/{script_id}/toggle", response_model=ApiResponse)
def toggle_script(
    script_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """切换话术启用/禁用状态（仅管理员以上）"""
    if current_user.role == "user":
        raise HTTPException(status_code=403, detail="权限不足")

    s = script_crud.get_script_by_id(db, script_id)
    if not s:
        raise HTTPException(status_code=404, detail="话术不存在")

    if current_user.role != "super_admin" and s.company_name != current_user.company_name:
        raise HTTPException(status_code=403, detail="权限不足")

    s = script_crud.update_script(db, script_id, is_active=not s.is_active)
    status_text = "启用" if s.is_active else "禁用"
    return ApiResponse(success=True, data={"id": s.id, "is_active": s.is_active}, message=f"已{status_text}")


@router.delete("/{script_id}", response_model=ApiResponse)
def delete_script(
    script_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除话术（仅管理员以上）"""
    if current_user.role == "user":
        raise HTTPException(status_code=403, detail="权限不足")

    s = script_crud.get_script_by_id(db, script_id)
    if not s:
        raise HTTPException(status_code=404, detail="话术不存在")

    if current_user.role != "super_admin" and s.company_name != current_user.company_name:
        raise HTTPException(status_code=403, detail="权限不足")

    ok = script_crud.delete_script(db, script_id)
    if not ok:
        raise HTTPException(status_code=404, detail="话术不存在")
    return ApiResponse(success=True, message="删除成功")


@router.post("/batch-delete", response_model=ApiResponse)
def batch_delete(
    ids: List[int],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """批量删除话术（仅管理员以上）"""
    if current_user.role == "user":
        raise HTTPException(status_code=403, detail="权限不足")

    # 校验公司隔离
    scripts = script_crud.get_scripts_by_ids(db, ids)
    for s in scripts:
        if current_user.role != "super_admin" and s.company_name != current_user.company_name:
            raise HTTPException(status_code=403, detail=f"话术 ID {s.id} 不属于您的公司")

    count = script_crud.batch_delete_scripts(db, ids)
    return ApiResponse(success=True, data={"count": count}, message=f"成功删除{count}条")
