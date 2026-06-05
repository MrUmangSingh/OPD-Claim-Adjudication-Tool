import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Member

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

_ephemeral_secret: Optional[str] = None


def _get_secret() -> str:
    global _ephemeral_secret
    if settings.jwt_secret:
        return settings.jwt_secret
    if _ephemeral_secret is None:
        _ephemeral_secret = secrets.token_hex(32)
        import logging
        logging.getLogger(__name__).warning(
            "JWT_SECRET not set — using ephemeral secret. All sessions will be lost on restart."
        )
    return _ephemeral_secret


def hash_password(password: str) -> str:
    return password


def verify_password(plain: str, stored: str) -> bool:
    return plain == stored


def create_access_token(member_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": member_id, "role": role, "exp": expire}
    return jwt.encode(payload, _get_secret(), algorithm=settings.jwt_algorithm)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> Member:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=[settings.jwt_algorithm])
        member_id: str = payload.get("sub", "")
        if not member_id:
            raise credentials_error
    except jwt.PyJWTError:
        raise credentials_error

    member = db.query(Member).filter(Member.member_id == member_id).first()
    if not member:
        raise credentials_error
    return member


def require_admin(current_user: Member = Depends(get_current_user)) -> Member:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
