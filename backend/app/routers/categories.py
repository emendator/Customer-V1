from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..schemas import CategoryCreate, CategoryUpdate, CategoryResponse, ApiResponse
from ..crud import category as category_crud
from ..models import User
from ..auth import get_current_user

router = APIRouter(prefix="/api/categories", tags=["分类管理"])


@router.get("", response_model=ApiResponse)
def list_categories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取分类树（按公司隔离）"""
    company_name = current_user.company_name if current_user.role != "super_admin" else None
    tree = category_crud.get_category_tree(db, company_name=company_name)
    return ApiResponse(success=True, data=tree)


@router.get("/flat", response_model=ApiResponse)
def list_categories_flat(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取所有分类（扁平列表，按公司隔离）"""
    company_name = current_user.company_name if current_user.role != "super_admin" else None
    categories = category_crud.get_all_categories(db, company_name=company_name)
    data = [
        {
            "id": c.id,
            "name": c.name,
            "parent_id": c.parent_id,
            "sort_order": c.sort_order,
        }
        for c in categories
    ]
    return ApiResponse(success=True, data=data)


@router.get("/{category_id}", response_model=ApiResponse)
def get_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取分类详情"""
    cat = category_crud.get_category_by_id(db, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    return ApiResponse(success=True, data={
        "id": cat.id,
        "name": cat.name,
        "parent_id": cat.parent_id,
        "sort_order": cat.sort_order,
        "is_active": cat.is_active,
    })


@router.post("", response_model=ApiResponse)
def create_category(
    body: CategoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """新增分类（仅管理员以上）"""
    if current_user.role == "user":
        raise HTTPException(status_code=403, detail="权限不足")

    # 检查同级下是否有重名
    existing = category_crud.get_category_by_name(db, body.name, body.parent_id)
    if existing:
        raise HTTPException(status_code=400, detail="同级分类下已存在同名分类")
    cat = category_crud.create_category(
        db, body.name, body.parent_id, body.sort_order,
        company_name=current_user.company_name,
    )
    return ApiResponse(success=True, data={"id": cat.id}, message="创建成功")


@router.put("/{category_id}", response_model=ApiResponse)
def update_category(
    category_id: int,
    body: CategoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """编辑分类（仅管理员以上）"""
    if current_user.role == "user":
        raise HTTPException(status_code=403, detail="权限不足")

    update_data = body.model_dump(exclude_none=True)
    cat = category_crud.update_category(db, category_id, **update_data)
    if not cat:
        raise HTTPException(status_code=404, detail="分类不存在")
    return ApiResponse(success=True, data={"id": cat.id}, message="更新成功")


@router.delete("/{category_id}", response_model=ApiResponse)
def delete_category(
    category_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除分类（仅管理员以上）"""
    if current_user.role == "user":
        raise HTTPException(status_code=403, detail="权限不足")

    ok = category_crud.delete_category(db, category_id)
    if not ok:
        raise HTTPException(status_code=400, detail="无法删除：分类不存在或存在关联的子分类/话术")
    return ApiResponse(success=True, message="删除成功")
