from sqlalchemy.orm import Session
from typing import Optional
from ..models import UsageLog


def create_log(
    db: Session,
    script_id: Optional[int] = None,
    customer_query: Optional[str] = None,
    category_id: Optional[int] = None,
    mode: str = "local",
    rating: Optional[int] = None,
    company_name: Optional[str] = None,
) -> UsageLog:
    log = UsageLog(
        script_id=script_id,
        customer_query=customer_query,
        category_id=category_id,
        mode=mode,
        rating=rating,
        company_name=company_name,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
