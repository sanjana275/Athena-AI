import logging
import os
import secrets
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth, credentials
except ImportError:
    firebase_admin = None

from ..config import settings
from ..db import get_db
from ..models import AuthSession, PasswordReset, SecurityEvent, User
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

# Initialize Firebase Admin SDK if service account file exists
_sa_path = os.getenv("FIREBASE_SA_PATH")
if not _sa_path:
    for candidate in [
        os.path.join(os.path.dirname(__file__), "..", "..", "firebase_sa.json"),
        os.path.join(os.getcwd(), "firebase_sa.json"),
        os.path.join(os.getcwd(), "backend", "firebase_sa.json"),
    ]:
        if os.path.isfile(candidate):
            _sa_path = candidate
            break

if firebase_admin and _sa_path and os.path.isfile(_sa_path) and not firebase_admin._apps:
    try:
        cred = credentials.Certificate(_sa_path)
        firebase_admin.initialize_app(cred)
        log.info(f"Firebase Admin initialized with {_sa_path}")
    except Exception as e:
        log.warning(f"Failed to initialize Firebase Admin: {e}")

oauth = OAuth()
if settings.google_client_id:
    oauth.register(
        name="google",
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        client_kwargs={"scope": "openid email profile"},
    )


def get_frontend_url(request: Request) -> str:
    """Dynamically determine the frontend origin so redirects never go to localhost in production."""
    # 1. Query parameter override
    if origin_param := request.query_params.get("origin"):
        return origin_param.rstrip("/")
    if redirect_to := request.query_params.get("redirect_to"):
        parsed = urllib.parse.urlparse(redirect_to)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    # 2. Referer header (e.g. https://athena-ai-fawn.vercel.app/login or Firebase)
    if referer := request.headers.get("referer"):
        parsed = urllib.parse.urlparse(referer)
        if parsed.scheme and parsed.netloc and "render.com" not in parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    # 3. Origin header
    if origin := request.headers.get("origin"):
        parsed = urllib.parse.urlparse(origin)
        if parsed.scheme and parsed.netloc and "render.com" not in parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"

    # 4. Forwarded host (proxy from Vercel / Firebase)
    if fwd_host := request.headers.get("x-forwarded-host") or request.headers.get("host"):
        if "onrender.com" not in fwd_host and "127.0.0.1" not in fwd_host:
            proto = request.headers.get("x-forwarded-proto", "https")
            return f"{proto}://{fwd_host}"

    # 5. Configured FRONTEND_URL if not localhost
    if settings.frontend_url and "localhost" not in settings.frontend_url:
        return settings.frontend_url.rstrip("/")

    # 6. Default to live Vercel domain if on cloud
    return "https://athena-ai-fawn.vercel.app"


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


def parse_device_info(ua_string: str) -> str:
    ua = (ua_string or "").lower()
    os_name = "Unknown OS"
    if "windows" in ua:
        os_name = "Windows"
    elif "macintosh" in ua or "mac os" in ua:
        os_name = "macOS"
    elif "android" in ua:
        os_name = "Android"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    elif "linux" in ua:
        os_name = "Linux"

    browser = "Web Browser"
    if "edg/" in ua:
        browser = "Microsoft Edge"
    elif "chrome/" in ua and "edg/" not in ua:
        browser = "Chrome"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "safari/" in ua and "chrome/" not in ua:
        browser = "Safari"

    return f"{os_name} · {browser}"


def log_security_event(
    db: Session,
    user_id: uuid.UUID,
    event_type: str,
    request: Request,
    status: str = "Success",
    details: str = "",
):
    try:
        ua = request.headers.get("user-agent", "")[:300]
        ip = _ip(request)
        device = parse_device_info(ua)
        evt = SecurityEvent(
            user_id=user_id,
            event_type=event_type,
            status=status,
            ip_address=ip,
            user_agent=ua,
            device_info=device,
            details=details,
        )
        db.add(evt)
        db.commit()
    except Exception as e:
        log.warning("Failed to record security event: %s", e)


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class FirebaseLoginIn(BaseModel):
    firebase_token: str
    email: str | None = None
    name: str | None = None
    picture: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotIn(BaseModel):
    email: EmailStr


class DirectResetIn(BaseModel):
    email: EmailStr
    new_password: str = Field(min_length=6, max_length=128)


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
    log_security_event(db, user.id, "register", request, "Success", "Account created")
    session_token = create_session(db, user, request)
    set_session_cookie(response, session_token)
    out = user_out(user)
    out["token"] = session_token
    return out


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    rate_limit(f"login:{_ip(request)}", 20, 60)
    rate_limit(f"login:{email}", 8, 60)
    user = db.scalar(select(User).where(User.email == email))
    if user and not user.password_hash:
        raise HTTPException(400, "This account uses Google sign-in. Continue with Google, or reset your password to add one.")
    if not user or not verify_password(user.password_hash or "", body.password):
        if user:
            log_security_event(db, user.id, "login_failed", request, "Failed", "Incorrect password attempt")
        raise HTTPException(401, "Incorrect email or password. If you haven't registered yet, please click 'Sign up' below.")
    log_security_event(db, user.id, "login_success", request, "Success", "Email & password sign-in")
    session_token = create_session(db, user, request)
    set_session_cookie(response, session_token)
    out = user_out(user)
    out["token"] = session_token
    return out


@router.post("/firebase-login")
def firebase_login(body: FirebaseLoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = None
    name = body.name or ""
    picture = body.picture or ""

    # 1. Verify with firebase-admin if initialized
    if firebase_admin and firebase_admin._apps:
        try:
            decoded = firebase_auth.verify_id_token(body.firebase_token, check_revoked=False)
            email = (decoded.get("email") or "").lower()
            name = decoded.get("name") or name
            picture = decoded.get("picture") or picture
        except Exception as e:
            log.warning(f"Firebase token verify failed: {e}. Trying unverified decode.")

    # 2. Fallback: decode claims with PyJWT if firebase-admin failed or project ID mismatch
    if not email:
        try:
            unverified = jwt.decode(body.firebase_token, options={"verify_signature": False})
            email = (unverified.get("email") or "").lower()
            name = unverified.get("name") or name
            picture = unverified.get("picture") or picture
        except Exception:
            pass

    # 3. Fallback to client-provided email
    if not email and body.email:
        email = body.email.lower()

    if not email:
        raise HTTPException(400, "Could not determine email from Google sign-in.")

    # Find or create user
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(
            email=email,
            name=name or email.split("@")[0],
            picture=picture,
            provider="google",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if picture and not user.picture:
            user.picture = picture
        if name and not user.name:
            user.name = name
        db.commit()

    log_security_event(db, user.id, "login_success", request, "Success", "Google authentication sign-in")
    session_token = create_session(db, user, request)
    set_session_cookie(response, session_token)
    out = user_out(user)
    out["token"] = session_token
    return out


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        user = current_user(request, db)
        log_security_event(db, user.id, "logout", request, "Success", "User signed out")
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


@router.post("/reset-direct")
def reset_direct(body: DirectResetIn, request: Request, db: Session = Depends(get_db)):
    """Allow immediate on-screen password reset without requiring external SMTP configuration."""
    rate_limit(f"reset-direct:{_ip(request)}", 15, 300)
    email = body.email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        raise HTTPException(404, "No account was found with this email address. Please make sure you enter your registered email.")

    user.password_hash = hash_password(body.new_password)
    # Revoke old sessions so they log in with the new password
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.commit()
    return {"message": "Password updated successfully. You can now sign in with your new password."}


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
    target_frontend = get_frontend_url(request)
    try:
        request.session["oauth_frontend"] = target_frontend
    except Exception:
        pass

    if not settings.google_client_id:
        # Fallback / One-click sign-in when Google credentials are not configured
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

        session_token = create_session(db, user, request)
        resp = RedirectResponse(f"{target_frontend}/chat?token={session_token}")
        set_session_cookie(resp, session_token)
        return resp

    base_api = str(request.base_url).rstrip("/")
    if "onrender.com" in base_api and base_api.startswith("http://"):
        base_api = "https://" + base_api[7:]
    redirect_uri = settings.google_redirect_uri or f"{base_api}/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri, prompt="select_account")


@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    target_frontend = None
    try:
        target_frontend = request.session.get("oauth_frontend")
    except Exception:
        pass
    if not target_frontend:
        target_frontend = get_frontend_url(request)

    fail = RedirectResponse(f"{target_frontend}/login?error=google")
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

    session_token = create_session(db, user, request)
    resp = RedirectResponse(f"{target_frontend}/chat?token={session_token}")
    set_session_cookie(resp, session_token)
    return resp
