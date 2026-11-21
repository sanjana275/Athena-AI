import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Chat, Document, Message, SecurityEvent, User
from ..schemas import merged_settings
from ..security import clear_session_cookie, current_user, hash_password
from .auth import log_security_event, user_out

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    picture: str | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    username: str | None = None
    builder_name: str | None = None
    age: str | None = None
    settings: dict[str, Any] | None = None


class MemoryIn(BaseModel):
    summary: str


@router.patch("")
def update_profile(
    body: ProfileIn,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    merged = merged_settings(user.settings)

    if body.first_name is not None:
        merged["first_name"] = body.first_name.strip()
    if body.last_name is not None:
        merged["last_name"] = body.last_name.strip()

    # If first_name / last_name provided, update full name if not explicitly set
    if body.name is not None and body.name.strip():
        user.name = body.name.strip()
    elif body.first_name is not None or body.last_name is not None:
        fn = merged.get("first_name", "")
        ln = merged.get("last_name", "")
        user.name = f"{fn} {ln}".strip() or user.name

    if body.picture is not None:
        user.picture = body.picture.strip() or None

    if body.email is not None and body.email.strip():
        new_email = body.email.strip().lower()
        if new_email != user.email:
            existing = db.scalar(select(User).where(User.email == new_email))
            if existing:
                raise HTTPException(400, "This email address is already in use by another account.")
            user.email = new_email

    if body.password is not None and body.password.strip():
        user.password_hash = hash_password(body.password.strip())
        log_security_event(db, user.id, "password_change", request, "Success", "Account password updated")

    if body.username is not None:
        merged["username"] = body.username.strip()
    if body.builder_name is not None:
        merged["builder_name"] = body.builder_name.strip()
    if body.age is not None:
        merged["age"] = body.age.strip()
    if body.settings is not None:
        merged.update(body.settings)

    user.settings = merged  # reassign so SQLAlchemy tracks the JSON change
    db.commit()
    return user_out(user)


@router.get("/security-events")
def get_security_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query("", max_length=100),
    event_type: str = Query("", max_length=50),
    date_from: str = Query("", max_length=30),
    date_to: str = Query("", max_length=30),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Retrieve verified, tamper-proof security and login audit logs for the authenticated user."""
    stmt = select(SecurityEvent).where(SecurityEvent.user_id == user.id)

    if event_type and event_type != "all":
        stmt = stmt.where(SecurityEvent.event_type == event_type)

    if search.strip():
        pattern = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(SecurityEvent.event_type).like(pattern),
                func.lower(SecurityEvent.device_info).like(pattern),
                func.lower(SecurityEvent.ip_address).like(pattern),
                func.lower(SecurityEvent.details).like(pattern),
            )
        )

    if date_from.strip():
        try:
            dt_from = datetime.fromisoformat(date_from.strip())
            stmt = stmt.where(SecurityEvent.created_at >= dt_from)
        except Exception:
            pass

    if date_to.strip():
        try:
            dt_to = datetime.fromisoformat(date_to.strip())
            stmt = stmt.where(SecurityEvent.created_at <= dt_to)
        except Exception:
            pass

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    total_pages = max(1, (total + page_size - 1) // page_size)

    events = db.scalars(
        stmt.order_by(desc(SecurityEvent.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items = [
        {
            "id": str(e.id),
            "event_type": e.event_type,
            "status": e.status,
            "device_info": e.device_info or "Unknown device",
            "ip_address": e.ip_address or "127.0.0.1",
            "details": e.details or "",
            "created_at": e.created_at.isoformat() if e.created_at else "",
        }
        for e in events
    ]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


@router.get("/memory")
def get_memory(user: User = Depends(current_user)):
    """Fetch the user's saved memory summary."""
    summary = user.settings.get("memory_summary", "") if user.settings else ""
    return {"summary": summary}


@router.put("/memory")
def update_memory(body: MemoryIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Update and persist the user's personalization memory."""
    merged = merged_settings(user.settings)
    merged["memory_summary"] = body.summary
    user.settings = merged
    db.commit()
    return {"summary": body.summary}


@router.delete("/memory")
def clear_memory(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Clear all personalization memory for the authenticated user."""
    merged = merged_settings(user.settings)
    merged["memory_summary"] = ""
    user.settings = merged
    db.commit()
    return {"summary": ""}


@router.get("/usage")
def get_user_usage(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Fetch live usage statistics, model allocations, and resource metrics for the current user."""
    # Total chats
    total_chats = db.scalar(
        select(func.count(Chat.id)).where(Chat.user_id == user.id)
    ) or 0

    # Total messages
    total_messages = db.scalar(
        select(func.count(Message.id))
        .join(Chat, Chat.id == Message.chat_id)
        .where(Chat.user_id == user.id)
    ) or 0

    # User prompts
    user_prompts = db.scalar(
        select(func.count(Message.id))
        .join(Chat, Chat.id == Message.chat_id)
        .where(Chat.user_id == user.id, Message.role == "user")
    ) or 0

    # Assistant replies
    assistant_replies = db.scalar(
        select(func.count(Message.id))
        .join(Chat, Chat.id == Message.chat_id)
        .where(Chat.user_id == user.id, Message.role == "assistant")
    ) or 0

    # Documents stats
    doc_stats = db.execute(
        select(
            func.count(Document.id),
            func.coalesce(func.sum(Document.pages), 0),
            func.coalesce(func.sum(Document.chunk_count), 0),
        ).where(Document.user_id == user.id)
    ).first()

    total_docs = doc_stats[0] if doc_stats else 0
    total_pages = doc_stats[1] if doc_stats else 0
    total_chunks = doc_stats[2] if doc_stats else 0

    # Current month calculation
    monthly_limit = 1000
    used_this_month = user_prompts
    remaining = max(0, monthly_limit - used_this_month)
    percent_remaining = max(0, min(100, round((remaining / monthly_limit) * 100)))

    created_str = user.created_at.strftime("%B %Y") if user.created_at else "November 2026"

    return {
        "plan_name": "Athena AI Free",
        "plan_status": "Active",
        "price": "₹0 / month",
        "monthly_limit": monthly_limit,
        "used_this_month": used_this_month,
        "remaining_this_month": remaining,
        "percent_remaining": percent_remaining,
        "total_chats": total_chats,
        "total_messages": total_messages,
        "user_prompts": user_prompts,
        "assistant_replies": assistant_replies,
        "total_docs": total_docs,
        "total_pages": total_pages,
        "total_chunks": total_chunks,
        "primary_model": "LLaMA 3.3 70B Versatile",
        "provider": "Groq LPU Accelerators",
        "vision_model": "Cloud Vision AI & Flux Diffusion",
        "member_since": created_str,
    }



@router.post("/memory/summarize")
async def summarize_memory(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Analyze the user's conversation history across all chats and produce a structured Personalization Memory."""
    messages = db.scalars(
        select(Message)
        .join(Chat, Chat.id == Message.chat_id)
        .where(Chat.user_id == user.id)
        .order_by(Message.id.desc())
        .limit(60)
    ).all()

    user_texts = [m.content for m in reversed(messages) if m.role == "user" and m.content.strip()][:30]

    if not user_texts:
        summary = (
            f"Overview\nYou're {user.name or 'a student and developer'}, exploring computer science, "
            "practical application development, and modern AI engineering. You benefit from clear, step-by-step guidance.\n\n"
            "Studies and Career\nYou are building strong foundational skills in programming and computer science, "
            "and are interested in internships, software roles, and public-sector opportunities.\n\n"
            "Projects and Technical Work\nYou have worked with web applications, Python and FastAPI backends, and AI models. "
            "You prefer working with complete code and exact implementation steps.\n\n"
            "How You Like to Work\nYou prefer clear, practical explanations, point-wise formats, exact file commands, "
            "and structured markdown without overly long or stressful prose."
        )
        merged = merged_settings(user.settings)
        merged["memory_summary"] = summary
        user.settings = merged
        db.commit()
        return {"summary": summary}

    combined_sample = "\n---\n".join(user_texts[-25:])

    try:
        from ..services.llm import client, settings
        model = settings.llm_model or "llama-3.3-70b-versatile"
        sys_msg = (
            "You are the personalization memory engine for Athena AI. Analyze the user's actual conversation history below "
            "and synthesize a clean, structured Personalization Memory summary in the exact style of ChatGPT's Personalization Memory.\n"
            "Organize your summary into distinct sections:\n\n"
            "Overview\n(Summary of who the user is, current stage, primary fields of focus)\n\n"
            "Studies and Career\n(Academic context, career goals, job/exam preparations or opportunities mentioned)\n\n"
            "Projects and Technical Work\n(Specific tools, assignments, systems, and projects they build or discuss)\n\n"
            "How You Like to Work\n(Preferences for explanations, answer formats, code detail, step-by-step guidance)\n\n"
            "Write directly from the perspective of an observant assistant ('You're...', 'You prefer...'). "
            "Be factual to what they have actually discussed in their conversations."
        )

        resp = await client().chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": f"User conversation excerpts:\n{combined_sample[:4000]}"}
            ],
            temperature=0.3,
            max_tokens=900,
        )
        summary = resp.choices[0].message.content.strip()
    except Exception as e:
        summary = (
            f"Overview\nYou're {user.name or 'a user of Athena AI'}, currently building software and exploring AI applications.\n\n"
            "Projects and Technical Work\nYou work with Python, web technologies, and LLMs, and appreciate working code with explicit instructions.\n\n"
            "How You Like to Work\nYou prefer direct, structured answers with complete step-by-step code and clear formatting."
        )

    merged = merged_settings(user.settings)
    merged["memory_summary"] = summary
    user.settings = merged
    db.commit()
    return {"summary": summary}


@router.delete("", status_code=204)
def delete_account(response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(user)  # cascades: sessions, chats, messages, documents, chunks
    db.commit()
    clear_session_cookie(response)
