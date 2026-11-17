import os
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Document, User
from ..security import current_user, rate_limit
from ..services.parsers import ALLOWED_EXTENSIONS
from ..services.rag import ingest

router = APIRouter(prefix="/documents", tags=["documents"])


def doc_out(d: Document) -> dict:
    return {
        "id": str(d.id),
        "filename": d.filename,
        "pages": d.pages,
        "chunk_count": d.chunk_count,
        "created_at": d.created_at,
    }


def safe_name(name: str) -> str:
    name = os.path.basename((name or "upload").replace("\\", "/"))
    name = re.sub(r"[^\w.\- ()]", "_", name).strip(" .")
    return (name or "upload")[:200]


@router.get("")
def list_documents(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())).all()
    return [doc_out(d) for d in rows]


@router.post("", status_code=201)
def upload(file: UploadFile, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Sync endpoint => runs in a worker thread, so parsing/embedding doesn't block the event loop.
    rate_limit(f"upload:{user.id}", 30, 3600)
    name = safe_name(file.filename or "")
    ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "Unsupported file type. Upload PDF, DOCX, TXT, CSV, JSON, PNG, JPG or WEBP.")
    limit = settings.max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File is larger than {settings.max_upload_mb} MB.")
    if not data:
        raise HTTPException(400, "The file is empty.")
    try:
        doc = ingest(db, user.id, name, data)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception:
        raise HTTPException(422, "Could not read this file. It may be corrupted.")
    return doc_out(doc)


@router.delete("/{doc_id}", status_code=204)
def delete_document(doc_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = db.scalar(select(Document).where(Document.id == doc_id, Document.user_id == user.id))
    if not doc:
        raise HTTPException(404, "Document not found")
    db.delete(doc)
    db.commit()
