from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Chat, Document, Message, User
from ..schemas import merged_settings
from ..security import clear_session_cookie, current_user, hash_password
from .auth import user_out

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    username: str | None = None
    builder_name: str | None = None
    age: str | None = None
    settings: dict[str, Any] | None = None


@router.patch("")
def update_profile(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.name is not None and body.name.strip():
        user.name = body.name.strip()

    if body.email is not None and body.email.strip():
        new_email = body.email.strip().lower()
        if new_email != user.email:
            existing = db.scalar(select(User).where(User.email == new_email))
            if existing:
                raise HTTPException(400, "This email address is already in use by another account.")
            user.email = new_email

    if body.password is not None and body.password.strip():
        user.password_hash = hash_password(body.password.strip())

    # Merge custom profile attributes and settings into user.settings JSON
    merged = merged_settings(user.settings)
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
