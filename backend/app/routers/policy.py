from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from ..models import Policy

router = APIRouter(prefix="/policy", tags=["policy"])


@router.get("")
def get_policy(db: Session = Depends(get_db)):
    policy = db.query(Policy).filter(Policy.active == True).first()
    if not policy:
        raise HTTPException(status_code=404, detail="No active policy found")
    return policy.payload
