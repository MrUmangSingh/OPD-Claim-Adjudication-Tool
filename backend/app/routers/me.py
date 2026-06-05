from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import Member, Policy
from ..services.benefits import compute_benefits_summary

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/benefits")
def get_benefits(
    current_user: Member = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "employee":
        raise HTTPException(status_code=403, detail="Benefits are only available for employees")
    policy = db.query(Policy).filter(Policy.active == True).first()
    if not policy:
        raise HTTPException(status_code=500, detail="No active policy")
    return compute_benefits_summary(current_user, policy.payload, db)
