from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from sqlalchemy.orm import Session

from .config import settings
from .db import init_db, get_db
from .routers import auth, chats, documents, export, profile, stream


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Athena AI API", lifespan=lifespan)

# Only used by Authlib for the short-lived Google OAuth "state" cookie.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="oauth_state",
    same_site="lax",
    https_only=settings.cookie_secure,
    max_age=600,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://athena-ai-fawn.vercel.app",
        "https://academiaai-98b85.web.app",
        "https://academiaai-98b85.firebaseapp.com",
        "https://linkdin-84f41.web.app",
        "https://linkdin-84f41.firebaseapp.com",
        "https://athena-ai-86018.web.app",
        "https://athena-ai-86018.firebaseapp.com",
        "https://athena-ai-27a17.web.app",
        "https://athena-ai-27a17.firebaseapp.com",
        settings.frontend_url.rstrip("/"),
    ],
    allow_origin_regex=r"https://.*\.web\.app|https://.*\.firebaseapp\.com|https://.*\.vercel\.app|http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, profile.router, chats.router, stream.router, documents.router, export.router):
    app.include_router(r)


# Support direct access to /api/auth/google/* (handles callbacks redirected to :8000/api/auth/google/callback)
@app.get("/api/auth/google/callback")
async def api_google_callback(request: Request, db: Session = Depends(get_db)):
    return await auth.google_callback(request, db)


@app.get("/api/auth/google/login")
async def api_google_login(request: Request, db: Session = Depends(get_db)):
    return await auth.google_login(request, db)


@app.post("/api/auth/firebase-login")
def api_firebase_login(body: auth.FirebaseLoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    return auth.firebase_login(body, request, response, db)


@app.get("/health")
def health():
    return {"status": "ok"}

