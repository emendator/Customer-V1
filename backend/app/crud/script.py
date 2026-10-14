from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import Optional, List
from ..models import Script, Category


def get_scripts(
    db: Session,
    keyword: Optional[str] = None,
    category_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    page: int = 1,
    page_size: int = 20,
    company_name: Optional[str] = None,
) -> tuple:
    """分页查询话术列表（支持公司隔离）"""
    q = db.query(Script).options(joinedload(Script.category))

    if keyword:
        q = q.filter(
            or_(
                Script.content.contains(keyword),
                Script.keywords.contains(keyword)
            )
        )
    if category_id is not None:
        # 查询该分类及其所有子分类
        child_ids = _get_child_category_ids(db, category_id)
        child_ids.append(category_id)
        q = q.filter(Script.category_id.in_(child_ids))
    if is_active is not None:
        q = q.filter(Script.is_active == is_active)
    if company_name:
        q = q.filter(Script.company_name == company_name)

    total = q.count()
    items = q.order_by(Script.id.asc()).offset((page - 1) * page_size).limit(page_size).all()

    return total, items


def _get_child_category_ids(db: Session, parent_id: int) -> List[int]:
    """递归获取所有子分类ID"""
    children = db.query(Category).filter(Category.parent_id == parent_id).all()
    ids = [c.id for c in children]
    for child in children:
        ids.extend(_get_child_category_ids(db, child.id))
    return ids


def get_script_by_id(db: Session, script_id: int) -> Optional[Script]:
    return db.query(Script).options(joinedload(Script.category)).filter(Script.id == script_id).first()


def get_all_active_scripts(db: Session, category_id: Optional[int] = None,
                           company_name: Optional[str] = None) -> List[Script]:
    """获取所有启用的话术，用于匹配引擎"""
    q = db.query(Script).options(joinedload(Script.category)).filter(Script.is_active == True)
    if category_id is not None:
        child_ids = _get_child_category_ids(db, category_id)
        child_ids.append(category_id)
        q = q.filter(Script.category_id.in_(child_ids))
    if company_name:
        q = q.filter(Script.company_name == company_name)
    return q.all()


def create_script(db: Session, content: str, category_id: Optional[int] = None,
                  keywords: str = "", source: str = "manual",
                  company_name: Optional[str] = None) -> Script:
    script = Script(
        content=content,
        category_id=category_id,
        keywords=keywords,
        source=source,
        company_name=company_name,
    )
    db.add(script)
    db.commit()
    db.refresh(script)
    return script


def batch_create_scripts(db: Session, items: List[dict]) -> List[Script]:
    """批量创建话术"""
    scripts = []
    for item in items:
        script = Script(**item)
        db.add(script)
        scripts.append(script)
    db.commit()
    for s in scripts:
        db.refresh(s)
    return scripts


def update_script(db: Session, script_id: int, **kwargs) -> Optional[Script]:
    script = get_script_by_id(db, script_id)
    if not script:
        return None
    for key, value in kwargs.items():
        if value is not None and hasattr(script, key):
            setattr(script, key, value)
    db.commit()
    db.refresh(script)
    return script


def delete_script(db: Session, script_id: int) -> bool:
    script = get_script_by_id(db, script_id)
    if not script:
        return False
    db.delete(script)
    db.commit()
    return True


def batch_delete_scripts(db: Session, script_ids: List[int]) -> int:
    """批量删除，返回删除数量"""
    count = db.query(Script).filter(Script.id.in_(script_ids)).delete(synchronize_session=False)
    db.commit()
    return count


def get_scripts_by_ids(db: Session, script_ids: List[int]) -> List[Script]:
    """根据ID列表获取话术（保持传入顺序）"""
    if not script_ids:
        return []
    scripts = db.query(Script).options(joinedload(Script.category)).filter(
        Script.id.in_(script_ids)
    ).all()
    # 按传入顺序排序
    id_order = {id: i for i, id in enumerate(script_ids)}
    scripts.sort(key=lambda s: id_order.get(s.id, 999))
    return scripts


def increment_usage(db: Session, script_id: int) -> Optional[Script]:
    """增加话术使用次数"""
    script = get_script_by_id(db, script_id)
    if script:
        script.usage_count += 1
        db.commit()
        db.refresh(script)
    return script


def rate_script(db: Session, script_id: int, rating: int) -> Optional[Script]:
    """话术评分"""
    script = get_script_by_id(db, script_id)
    if script:
        if rating == 1:
            script.rating_good += 1
        elif rating == 0:
            script.rating_bad += 1
        db.commit()
        db.refresh(script)
    return script
