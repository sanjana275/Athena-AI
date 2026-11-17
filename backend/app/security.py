import hashlib
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from time import monotonic

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AuthSession, User

_ph = PasswordHasher()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


# ---------- sessions ----------
def create_session(db: Session, user: User, request: Request) -> str:
    """Creates a server-side session row and returns the signed cookie value."""
    expires = datetime.now(timezone.utc) + timedelta(days=settings.session_days)
    row = AuthSession(
        user_id=user.id,
        user_agent=(request.headers.get("user-agent") or "")[:300],
        expires_at=expires,
    )
    db.add(row)
    db.commit()
    return jwt.encode(
        {"sub": str(user.id), "sid": str(row.id), "exp": expires}, settings.secret_key, algorithm="HS256"
    )


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.cookie_name,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
    )


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(settings.cookie_name)
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not signed in")
    try:
        data = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        sid = uuid.UUID(data["sid"])
        uid = uuid.UUID(data["sub"])
    except Exception:
        raise HTTPException(401, "Session expired. Sign in again.")
    row = db.get(AuthSession, sid)
    if not row or row.user_id != uid:
        raise HTTPException(401, "Session expired. Sign in again.")
    exp = row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired. Sign in again.")
    user = db.get(User, uid)
    if not user:
        raise HTTPException(401, "Account not found")
    request.state.session_id = sid
    return user


# ---------- tiny in-memory rate limiter (per process) ----------
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(key: str, limit: int = 10, window: int = 60) -> None:
    now = monotonic()
    q = _hits[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many attempts. Wait a minute and try again.")
    q.append(now)
