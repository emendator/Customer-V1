from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from ..models import Category, Script


def get_category_tree(db: Session, company_name: Optional[str] = None) -> List[dict]:
    """获取完整的分类树（含话术计数，支持公司隔离）"""
    q = db.query(Category).filter(Category.is_active == True)
    if company_name:
        q = q.filter(Category.company_name == company_name)
    all_categories = q.order_by(Category.sort_order).all()

    def count_scripts(cat: Category) -> int:
        """递归统计该分类及其所有子分类的话术总数"""
        q = db.query(func.count(Script.id)).filter(
            Script.category_id == cat.id, Script.is_active == True
        )
        if company_name:
            q = q.filter(Script.company_name == company_name)
        total = q.scalar() or 0
        for child in all_categories:
            if child.parent_id == cat.id:
                total += count_scripts(child)
        return total

    def build_node(cat: Category) -> dict:
        children = [build_node(c) for c in all_categories if c.parent_id == cat.id]
        script_count = count_scripts(cat)
        return {
            "id": cat.id,
            "name": cat.name,
            "parent_id": cat.parent_id,
            "sort_order": cat.sort_order,
            "is_active": cat.is_active,
            "script_count": script_count,
            "children": children,
        }

    roots = [build_node(c) for c in all_categories if c.parent_id is None]
    return roots


def get_all_categories(db: Session, company_name: Optional[str] = None) -> List[Category]:
    """获取所有启用的分类（扁平列表，支持公司隔离）"""
    q = db.query(Category).filter(Category.is_active == True)
    if company_name:
        q = q.filter(Category.company_name == company_name)
    return q.order_by(Category.sort_order).all()


def get_category_by_id(db: Session, category_id: int) -> Optional[Category]:
    return db.query(Category).filter(Category.id == category_id).first()


def get_category_by_name(db: Session, name: str, parent_id: Optional[int] = None) -> Optional[Category]:
    q = db.query(Category).filter(Category.name == name)
    if parent_id is not None:
        q = q.filter(Category.parent_id == parent_id)
    return q.first()


def create_category(db: Session, name: str, parent_id: Optional[int] = None,
                    sort_order: int = 0, company_name: Optional[str] = None) -> Category:
    cat = Category(name=name, parent_id=parent_id, sort_order=sort_order, company_name=company_name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


def update_category(db: Session, category_id: int, **kwargs) -> Optional[Category]:
    cat = get_category_by_id(db, category_id)
    if not cat:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(cat, key):
            setattr(cat, key, value)
    db.commit()
    db.refresh(cat)
    return cat


def delete_category(db: Session, category_id: int) -> bool:
    cat = get_category_by_id(db, category_id)
    if not cat:
        return False
    # 检查是否有子分类
    children = db.query(Category).filter(Category.parent_id == category_id).count()
    if children > 0:
        return False
    # 检查是否有关联话术
    script_count = db.query(func.count(Script.id)).filter(Script.category_id == category_id).scalar()
    if script_count > 0:
        return False
    db.delete(cat)
    db.commit()
    return True
