from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..auth import require_admin
from ..db import get_db
from ..models import Member

router = APIRouter(prefix="/members", tags=["members"], dependencies=[Depends(require_admin)])


@router.get("")
def list_members(db: Session = Depends(get_db)):
    members = db.query(Member).all()
    return [
        {"member_id": m.member_id, "name": m.name, "join_date": str(m.join_date)}
        for m in members
    ]
