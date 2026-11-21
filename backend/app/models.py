import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .config import settings
from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


def uid_col(*args, **kw):
    return mapped_column(Uuid(as_uuid=True), *args, **kw)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uid_col(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    picture: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(300), nullable=True)
    provider: Mapped[str] = mapped_column(String(20), default="password")  # password | google
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    chats = relationship("Chat", cascade="all, delete-orphan", passive_deletes=True)
    documents = relationship("Document", cascade="all, delete-orphan", passive_deletes=True)
    sessions = relationship("AuthSession", cascade="all, delete-orphan", passive_deletes=True)
    security_events = relationship("SecurityEvent", cascade="all, delete-orphan", passive_deletes=True)


class SecurityEvent(Base):
    __tablename__ = "security_events"

    id: Mapped[uuid.UUID] = uid_col(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = uid_col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(50), index=True)  # login_success, login_failed, logout, password_change
    status: Mapped[str] = mapped_column(String(20), default="Success")  # Success | Failed
    ip_address: Mapped[str] = mapped_column(String(45), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    device_info: Mapped[str] = mapped_column(String(120), default="")  # e.g. "Windows 11 · Chrome"
    details: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class AuthSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = uid_col(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = uid_col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = uid_col(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = uid_col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[uuid.UUID] = uid_col(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = uid_col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="New chat")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)

    messages = relationship(
        "Message", cascade="all, delete-orphan", passive_deletes=True, order_by="Message.id"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chat_id: Mapped[uuid.UUID] = uid_col(ForeignKey("chats.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(12))  # user | assistant
    content: Mapped[str] = mapped_column(Text, default="")
    sources: Mapped[list] = mapped_column(JSON, default=list)
    feedback: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1 | -1
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = uid_col(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = uid_col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    pages: Mapped[int] = mapped_column(Integer, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    chunks = relationship("Chunk", cascade="all, delete-orphan", passive_deletes=True)


if settings.is_sqlite:
    class Chunk(Base):
        __tablename__ = "chunks"

        id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
        document_id: Mapped[uuid.UUID] = uid_col(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
        user_id: Mapped[uuid.UUID] = uid_col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
        location: Mapped[str] = mapped_column(String(80), default="")  # "Page 4", "Rows 1-40", "Section 2"
        content: Mapped[str] = mapped_column(Text)
        embedding: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON-encoded list of floats
else:
    from pgvector.sqlalchemy import Vector

    class Chunk(Base):
        __tablename__ = "chunks"

        id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
        document_id: Mapped[uuid.UUID] = uid_col(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
        user_id: Mapped[uuid.UUID] = uid_col(ForeignKey("users.id", ondelete="CASCADE"), index=True)
        location: Mapped[str] = mapped_column(String(80), default="")
        content: Mapped[str] = mapped_column(Text)
        embedding = mapped_column(Vector(settings.embed_dim))

        __table_args__ = (
            Index(
                "ix_chunks_embedding_hnsw",
                "embedding",
                postgresql_using="hnsw",
                postgresql_with={"m": 16, "ef_construction": 64},
                postgresql_ops={"embedding": "vector_cosine_ops"},
            ),
        )
