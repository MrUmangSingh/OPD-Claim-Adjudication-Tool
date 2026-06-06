from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..db import get_db
from ..models import Member

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class UserResponse(BaseModel):
    member_id: str
    name: str
    email: str
    role: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    if db.query(Member).filter(Member.email == body.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    # Generate next EMP### member_id
    emp_ids = [
        int(m.member_id[3:])
        for m in db.query(Member).all()
        if m.member_id.startswith("EMP") and m.member_id[3:].isdigit()
    ]
    next_num = (max(emp_ids) + 1) if emp_ids else 1
    member_id = f"EMP{next_num:03d}"

    member = Member(
        member_id=member_id,
        name=body.name.strip(),
        email=body.email.strip().lower(),
        password_hash=hash_password(body.password),
        join_date=date.today(),
        role="employee",
    )
    db.add(member)
    db.commit()
    db.refresh(member)

    token = create_access_token(member.member_id, member.role)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            member_id=member.member_id,
            name=member.name,
            email=member.email or "",
            role=member.role,
        ),
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.email == body.email).first()
    if not member or not member.password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not verify_password(body.password, member.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token = create_access_token(member.member_id, member.role)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            member_id=member.member_id,
            name=member.name,
            email=member.email or "",
            role=member.role,
        ),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: Member = Depends(get_current_user)):
    return UserResponse(
        member_id=current_user.member_id,
        name=current_user.name,
        email=current_user.email or "",
        role=current_user.role,
    )
