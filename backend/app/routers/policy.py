from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from ..db import get_db
from ..models import Policy

router = APIRouter(prefix="/policy", tags=["policy"])


REQUIRED_TOP_LEVEL_KEYS = {
    "policy_id",
    "effective_date",
    "coverage_details",
    "waiting_periods",
    "exclusions",
    "network_hospitals",
}


@router.get("")
def get_policy(db: Session = Depends(get_db)):
    policy = db.query(Policy).filter(Policy.active == True).first()
    if not policy:
        raise HTTPException(status_code=404, detail="No active policy found")
    return policy.payload


@router.put("")
def update_policy(payload: dict = Body(...), db: Session = Depends(get_db)):
    """Replace the active policy payload. Validates required top-level keys."""
    missing = REQUIRED_TOP_LEVEL_KEYS - set(payload.keys())
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Policy missing required keys: {sorted(missing)}",
        )

    policy = db.query(Policy).filter(Policy.active == True).first()
    if not policy:
        raise HTTPException(status_code=404, detail="No active policy to update")

    policy.payload = payload
    flag_modified(policy, "payload")
    db.commit()
    db.refresh(policy)
    return policy.payload
