import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Chat, Message, User, now
from ..security import current_user

router = APIRouter(tags=["chats"])


def chat_out(c: Chat) -> dict:
    return {"id": str(c.id), "title": c.title, "created_at": c.created_at, "updated_at": c.updated_at}


def message_out(m: Message) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "sources": m.sources or [],
        "feedback": m.feedback,
        "created_at": m.created_at,
    }


def get_chat(db: Session, chat_id: uuid.UUID, user: User) -> Chat:
    chat = db.scalar(select(Chat).where(Chat.id == chat_id, Chat.user_id == user.id))
    if not chat:
        raise HTTPException(404, "Chat not found")
    return chat


class ChatIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class FeedbackIn(BaseModel):
    value: int = Field(ge=-1, le=1)  # 1 up, -1 down, 0 clear


@router.get("/chats")
def list_chats(q: str | None = None, archived: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Chat).where(Chat.user_id == user.id)
    archived_ids = set((user.settings or {}).get("archived_chats", []))

    if q and q.strip():
        like = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        in_messages = select(Message.chat_id).join(Chat, Chat.id == Message.chat_id).where(
            Chat.user_id == user.id, Message.content.ilike(like, escape="\\")
        )
        stmt = stmt.where(or_(Chat.title.ilike(like, escape="\\"), Chat.id.in_(in_messages)))
    rows = db.scalars(stmt.order_by(Chat.updated_at.desc()).limit(200)).all()

    if archived:
        return [chat_out(c) for c in rows if str(c.id) in archived_ids]
    return [chat_out(c) for c in rows if str(c.id) not in archived_ids]


@router.post("/chats", status_code=201)
def create_chat(body: ChatIn | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    chat = Chat(user_id=user.id, title=(body.title if body and body.title else "New chat"))
    db.add(chat)
    db.commit()
    return chat_out(chat)


@router.delete("/chats", status_code=204)
def delete_all_chats(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(Chat).where(Chat.user_id == user.id))
    db.commit()


@router.get("/chats/{chat_id}")
def read_chat(chat_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    chat = get_chat(db, chat_id, user)
    return {"chat": chat_out(chat), "messages": [message_out(m) for m in chat.messages]}


@router.patch("/chats/{chat_id}")
def rename_chat(chat_id: uuid.UUID, body: ChatIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    chat = get_chat(db, chat_id, user)
    if body.title and body.title.strip():
        chat.title = body.title.strip()[:200]
    db.commit()
    return chat_out(chat)


@router.delete("/chats/{chat_id}", status_code=204)
def delete_chat(chat_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_chat(db, chat_id, user))
    db.commit()


@router.post("/chats/{chat_id}/archive")
def archive_chat(chat_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    chat = get_chat(db, chat_id, user)
    merged = dict(user.settings or {})
    archived = list(merged.get("archived_chats", []))
    sid = str(chat.id)
    if sid not in archived:
        archived.append(sid)
    merged["archived_chats"] = archived
    user.settings = merged
    db.commit()
    return {"status": "archived", "id": sid}


@router.post("/chats/{chat_id}/unarchive")
def unarchive_chat(chat_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    chat = get_chat(db, chat_id, user)
    merged = dict(user.settings or {})
    archived = [x for x in merged.get("archived_chats", []) if x != str(chat.id)]
    merged["archived_chats"] = archived
    user.settings = merged
    db.commit()
    return {"status": "unarchived", "id": str(chat.id)}



@router.patch("/messages/{message_id}/feedback")
def feedback(message_id: int, body: FeedbackIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    msg = db.scalar(
        select(Message).join(Chat, Chat.id == Message.chat_id).where(
            Message.id == message_id, Chat.user_id == user.id, Message.role == "assistant"
        )
    )
    if not msg:
        raise HTTPException(404, "Message not found")
    msg.feedback = body.value or None
    db.commit()
    return {"id": msg.id, "feedback": msg.feedback}
