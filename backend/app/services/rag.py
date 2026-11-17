import json
import math
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Chunk, Document
from .embeddings import embed_texts
from .parsers import parse_file


def split_text(text: str, size: int = 1000, overlap: int = 150) -> list[str]:
    text = " ".join(text.split()) if len(text) < size else text.strip()
    if len(text) <= size:
        return [text] if text else []
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):  # prefer to break on a paragraph/sentence/space boundary
            cut = max(text.rfind("\n\n", start, end), text.rfind(". ", start, end), text.rfind("\n", start, end))
            if cut > start + size // 2:
                end = cut + 1
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


def ingest(db: Session, user_id: uuid.UUID, filename: str, data: bytes) -> Document:
    parts = parse_file(filename, data)
    pieces: list[tuple[str, str]] = []
    for location, text in parts:
        for piece in split_text(text):
            pieces.append((location, piece))
    if not pieces:
        raise ValueError("No readable text found in this file.")
    if len(pieces) > settings.max_chunks_per_doc:
        raise ValueError("This document is too large. Split it and upload the parts.")

    vectors = embed_texts([p[1] for p in pieces])
    doc = Document(user_id=user_id, filename=filename, pages=len(parts), chunk_count=len(pieces))
    db.add(doc)
    db.flush()

    if settings.is_sqlite:
        db.add_all(
            Chunk(
                document_id=doc.id,
                user_id=user_id,
                location=loc,
                content=txt,
                embedding=json.dumps(vec),
            )
            for (loc, txt), vec in zip(pieces, vectors)
        )
    else:
        db.add_all(
            Chunk(document_id=doc.id, user_id=user_id, location=loc, content=txt, embedding=vec)
            for (loc, txt), vec in zip(pieces, vectors)
        )
    db.commit()
    return doc


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def retrieve(db: Session, user_id: uuid.UUID, query: str, k: int = 5) -> list[dict]:
    """Top-k chunks from THIS user's documents only."""
    if not query.strip():
        return []
    qvec = embed_texts([query])[0]

    if settings.is_sqlite:
        # Brute-force cosine similarity for SQLite
        rows = db.execute(
            select(Chunk, Document.filename)
            .join(Document, Document.id == Chunk.document_id)
            .where(Chunk.user_id == user_id)
        ).all()
        scored = []
        for chunk, filename in rows:
            if not chunk.embedding:
                continue
            cvec = json.loads(chunk.embedding)
            sim = _cosine_similarity(qvec, cvec)
            scored.append((chunk, filename, sim))
        scored.sort(key=lambda x: x[2], reverse=True)
        return [
            {
                "document_id": str(c.document_id),
                "filename": fn,
                "location": c.location,
                "content": c.content,
                "score": round(sim, 4),
            }
            for c, fn, sim in scored[:k]
        ]
    else:
        dist = Chunk.embedding.cosine_distance(qvec).label("dist")
        rows = db.execute(
            select(Chunk, Document.filename, dist)
            .join(Document, Document.id == Chunk.document_id)
            .where(Chunk.user_id == user_id)
            .order_by(dist)
            .limit(k)
        ).all()
        return [
            {
                "document_id": str(c.document_id),
                "filename": fn,
                "location": c.location,
                "content": c.content,
                "score": round(1 - float(d), 4),
            }
            for c, fn, d in rows
        ]
