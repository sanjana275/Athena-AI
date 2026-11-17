import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import AuthSession, PasswordReset, User
from ..schemas import merged_settings
from ..security import (
    clear_session_cookie,
    create_session,
    current_user,
    hash_password,
    rate_limit,
    set_session_cookie,
    sha256,
    verify_password,
)
from ..services.emailer import send_email

log = logging.getLogger("auth")
router = APIRouter(prefix="/auth", tags=["auth"])

oauth = OAuth()
if settings.google_client_id:
    oauth.register(
        name="google",
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        client_kwargs={"scope": "openid email profile"},
    )


def user_out(u: User) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "name": u.name,
        "picture": u.picture,
        "provider": u.provider,
        "settings": merged_settings(u.settings),
        "created_at": u.created_at,
    }


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    rate_limit(f"register:{_ip(request)}", 10, 3600)
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password), provider="password")
    db.add(user)
    db.commit()
    set_session_cookie(response, create_session(db, user, request))
    return user_out(user)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    rate_limit(f"login:{_ip(request)}", 20, 60)
    rate_limit(f"login:{email}", 8, 60)
    user = db.scalar(select(User).where(User.email == email))
    if user and not user.password_hash:
        raise HTTPException(400, "This account uses Google sign-in. Continue with Google, or reset your password to add one.")
    if not user or not verify_password(user.password_hash or "", body.password):
        raise HTTPException(401, "Incorrect email or password.")
    set_session_cookie(response, create_session(db, user, request))
    return user_out(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        user = current_user(request, db)
        db.execute(delete(AuthSession).where(AuthSession.id == request.state.session_id, AuthSession.user_id == user.id))
        db.commit()
    except HTTPException:
        pass
    clear_session_cookie(response)


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


# ---------- password reset ----------
@router.post("/forgot", status_code=202)
def forgot(body: ForgotIn, request: Request, tasks: BackgroundTasks, db: Session = Depends(get_db)):
    rate_limit(f"forgot:{_ip(request)}", 10, 3600)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    reset_link = None
    if user:
        token = secrets.token_urlsafe(32)
        db.add(
            PasswordReset(
                user_id=user.id,
                token_hash=sha256(token),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )
        )
        db.commit()
        reset_link = f"{settings.frontend_url.rstrip('/')}/reset?token={token}"
        tasks.add_task(
            send_email,
            user.email,
            "Reset your password",
            f"Hi {user.name or 'there'},\n\nUse this link to choose a new password. It expires in 1 hour:\n{reset_link}\n\n"
            "If you didn't ask for this, ignore this email.",
        )
    return {
        "message": "If that email has an account, a reset link is on its way.",
        "reset_link": reset_link,
    }


@router.post("/reset")
def reset(body: ResetIn, db: Session = Depends(get_db)):
    row = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == sha256(body.token)))
    if not row or row.used:
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    exp = row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    user = db.get(User, row.user_id)
    if not user:
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    user.password_hash = hash_password(body.password)
    row.used = True
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))  # sign out everywhere
    db.commit()
    return {"message": "Password updated. Sign in with your new password."}


# ---------- session management ----------
@router.get("/sessions")
def sessions(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AuthSession)
        .where(AuthSession.user_id == user.id)
        .order_by(AuthSession.created_at.desc())
    ).all()
    now_utc = datetime.now(timezone.utc)
    valid_rows = [
        r for r in rows
        if (r.expires_at.replace(tzinfo=timezone.utc) if r.expires_at.tzinfo is None else r.expires_at) > now_utc
    ]
    return [
        {
            "id": str(r.id),
            "user_agent": r.user_agent,
            "created_at": r.created_at,
            "current": r.id == request.state.session_id,
        }
        for r in valid_rows
    ]


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == user.id))
    db.commit()


# ---------- Google OAuth ----------
@router.get("/google/login")
async def google_login(request: Request, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        # Fallback / One-click local sign-in when Google credentials are not configured
        email = "sanjana.google@gmail.com"
        user = db.scalar(select(User).where(User.email == email))
        if not user:
            user = User(
                email=email,
                name="Sanjana (Google User)",
                picture="https://api.dicebear.com/7.x/notionists/svg?seed=Sanjana",
                provider="google",
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        resp = RedirectResponse(f"{settings.frontend_url.rstrip('/')}/chat")
        set_session_cookie(resp, create_session(db, user, request))
        return resp

    return await oauth.google.authorize_redirect(request, settings.google_redirect, prompt="select_account")


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    fail = RedirectResponse(f"{settings.frontend_url.rstrip('/')}/login?error=google")
    if not settings.google_client_id:
        return fail
    try:
        token = await oauth.google.authorize_access_token(request)
        info = token.get("userinfo") or {}
        email = (info.get("email") or "").lower()
        if not email or not info.get("email_verified", False):
            return fail
    except Exception:
        log.exception("Google OAuth failed")
        return fail

    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(email=email, name=info.get("name") or email.split("@")[0], picture=info.get("picture"), provider="google")
        db.add(user)
        db.commit()
    elif not user.picture and info.get("picture"):
        user.picture = info["picture"]
        db.commit()

    resp = RedirectResponse(f"{settings.frontend_url.rstrip('/')}/chat")
    set_session_cookie(resp, create_session(db, user, request))
    return resp
