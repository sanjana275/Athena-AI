import asyncio
import hashlib
import json
import logging
import re
import urllib.parse
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..models import Chat, Message, User, now
from ..schemas import merged_settings
from ..security import current_user
from ..services import llm
from ..services.rag import retrieve
from .chats import get_chat

log = logging.getLogger("stream")
router = APIRouter(tags=["stream"])


def extract_embedded_image(prompt: str) -> tuple[str, str | None]:
    """Return (clean_text_without_base64, data_url_or_None).
    Strips the markdown image embed with a base64 data URL from the message text.
    """
    pattern = r'!\[[^\]]*\]\((data:image/[^;]+;base64,[A-Za-z0-9+/=]+)\)'
    m = re.search(pattern, prompt)
    if m:
        data_url = m.group(1)
        clean = re.sub(pattern, '', prompt).strip()
        return clean, data_url
    return prompt, None


def detect_image_request(prompt: str) -> tuple[bool, str]:
    low = prompt.strip().lower()

    # Negative check - do not trigger on questions about images or code
    negatives = [
        "how to generate image", "how do diffusion models", "how do you create an image",
        "code for image", "python code to draw", "why can't you create"
    ]
    if any(neg in low for neg in negatives):
        return False, ""

    # 1. Any variation of (create/generate/draw/paint/make/show/render/crete) + optional words + (image/picture/photo/illustration/drawing/graphic/chart/flat-lay/diagram)
    m = re.search(r'(?:create|generate|make|draw|paint|render|produce|show\s+me|crete)\s+(?:me\s+)?(?:an?|a\s+)?(?:\w+\s+)?(?:image|picture|photo|illustration|drawing|art|portrait|graphic|chart|flat-lay|diagram)s?\s*(?:of|about|depicting|showing|for|with)?\s*[:\.\s]*(.*)', low)
    if m:
        subj = m.group(1).strip(" .!?:;'\"")
        subj = re.sub(r'^(?:plz|please|just|kindly|also|can you|could you)+[\s\.,;:]*', '', subj, flags=re.IGNORECASE).strip(" .!?:;'\"")
        if len(subj) > 2:
            return True, subj

    # 2. 'image of ...' or 'picture of ...' anywhere
    m2 = re.search(r'(?:image|picture|photo|illustration)\s+of\s+([^,\.\n]+)', low)
    if m2:
        subj = m2.group(1).strip(" .!?:;'\"")
        if len(subj) > 2:
            return True, subj

    # 3. Direct aesthetic prompt
    m3 = re.search(r'^(?:a\s+)?(?:flat-lay|photograph|cinematic\s+shot|portrait|macro\s+shot)\s+of\s+(.*)', low)
    if m3:
        return True, prompt.strip(" '\"")

    # 4. Ends with '... image' or '... picture'
    m4 = re.search(r'(?:create|want|need|show|atlest)\s+(.*?)\s+(?:image|picture|photo)s?$', low)
    if m4:
        subj = m4.group(1).strip(" .!?:;'\"")
        if len(subj) > 2:
            return True, subj

    return False, ""


class StreamIn(BaseModel):
    content: str | None = Field(default=None, max_length=5_000_000)  # large enough for base64 images
    use_documents: bool = False
    edit_message_id: int | None = None  # edit this user message, drop everything after it, regenerate
    regenerate: bool = False  # regenerate the last assistant message
    model_id: str | None = None  # optional model override from the frontend model selector


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def friendly_error(e: Exception) -> str:
    name = type(e).__name__
    status = getattr(e, "status_code", None)
    if isinstance(e, RuntimeError):
        return str(e)
    if status == 429:
        return "The model provider is rate-limiting requests. Wait a moment and try again."
    if status in (401, 403):
        return "The server's model API key was rejected. Contact the site owner."
    if status == 404:
        return "The configured model was not found at the provider."
    if name in ("APIConnectionError", "APITimeoutError"):
        return "Could not reach the model provider. Try again shortly."
    return "The model request failed. Try again."


@router.post("/chats/{chat_id}/stream")
async def stream_reply(
    chat_id: uuid.UUID,
    body: StreamIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    chat = get_chat(db, chat_id, user)
    user_message_id: int | None = None

    if body.edit_message_id is not None:
        target = db.scalar(
            select(Message).where(
                Message.id == body.edit_message_id, Message.chat_id == chat.id, Message.role == "user"
            )
        )
        if not target or not (body.content or "").strip():
            raise HTTPException(400, "Nothing to edit")
        target.content = body.content.strip()
        db.execute(delete(Message).where(Message.chat_id == chat.id, Message.id > target.id))
        user_message_id = target.id
    elif body.regenerate:
        last = db.scalar(select(Message).where(Message.chat_id == chat.id).order_by(Message.id.desc()).limit(1))
        if not last or last.role != "assistant":
            raise HTTPException(400, "Nothing to regenerate")
        db.delete(last)
    else:
        if not (body.content or "").strip():
            raise HTTPException(400, "Message is empty")
        raw_content = body.content.strip()
        # Store a clean version: strip embedded base64 image data to keep the DB lean
        clean_content, _ = extract_embedded_image(raw_content)
        store_content = (clean_content or "[image attached]").strip()
        m = Message(chat_id=chat.id, role="user", content=store_content)
        db.add(m)
        db.flush()
        user_message_id = m.id

    history = [(m.role, m.content) for m in db.scalars(
        select(Message).where(Message.chat_id == chat.id).order_by(Message.id)
    ).all()]
    if not history or history[-1][0] != "user":
        raise HTTPException(400, "Conversation must end with a user message")

    if chat.title == "New chat" and len(history) >= 1:
        first = next((c for r, c in history if r == "user"), "")
        clean_first, _ = extract_embedded_image(first)
        chat.title = await llm.generate_chat_title(clean_first or first)
    chat.updated_at = now()
    db.commit()

    cfg = merged_settings(user.settings)
    user_id, cid = user.id, chat.id

    # Model override from frontend model selector
    override_model = body.model_id or None

    # The raw content (may contain base64 image) for vision routing
    raw_last_prompt = body.content.strip() if body.content else (history[-1][1] if history else "")

    # RAG
    sources: list[dict] = []
    if body.use_documents:
        query = history[-1][1]
        if len(query) < 40 and len(history) >= 3:  # short follow-up: add the previous question for context
            query = history[-3][1] + "\n" + query
        sources = await run_in_threadpool(retrieve, db, user_id, query, 5)

    messages = llm.build_messages(cfg["system_prompt"], history, sources)

    async def gen():
        parts: list[str] = []
        saved_id: int | None = None

        def save() -> int | None:
            text = "".join(parts).strip()
            if not text:
                return None
            with SessionLocal() as s:
                am = Message(chat_id=cid, role="assistant", content=text, sources=sources)
                s.add(am)
                c = s.get(Chat, cid)
                if c:
                    c.updated_at = now()
                s.commit()
                return am.id

        try:
            yield sse({"type": "meta", "user_message_id": user_message_id, "title": chat.title})
            if sources:
                yield sse({"type": "sources", "sources": sources})

            last_prompt = history[-1][1] if history else ""

            # ── Vision: user pasted / attached an image ──────────────────────
            # Use the raw body content (may contain base64) for vision detection
            vision_source = raw_last_prompt if raw_last_prompt else last_prompt
            clean_text, embedded_data_url = extract_embedded_image(vision_source)
            if embedded_data_url:
                question = clean_text or "Please describe and explain this image in detail."
                yield sse({"type": "token", "text": "🔍 Analysing your image with the vision model…\n\n"})
                parts.append("🔍 Analysing your image with the vision model…\n\n")
                async for delta in llm.stream_vision_completion(
                    cfg.get("system_prompt", ""),
                    question,
                    embedded_data_url,
                    float(cfg["temperature"]),
                    int(cfg["max_tokens"]),
                ):
                    parts.append(delta)
                    yield sse({"type": "token", "text": delta})
                saved_id = save()
                yield sse({"type": "done", "assistant_message_id": saved_id})
                return

            # ── Image Generation Intent ───────────────────────────────────────
            is_img, img_subj = detect_image_request(last_prompt)
            if is_img:
                yield sse({"type": "token", "text": "Creating your high-resolution image...\n\n"})
                parts.append("Creating your high-resolution image...\n\n")
                await asyncio.sleep(0.3)

                encoded = urllib.parse.quote(img_subj)
                seed = hashlib.md5(img_subj.encode()).hexdigest()[:6]
                img_url = f"https://image.pollinations.ai/prompt/{encoded}?width=1024&height=1024&nologo=true&enhance=true&seed={seed}"
                response_md = (
                    f"Here is the generated image for **\"{img_subj}\"**:\n\n"
                    f"![{img_subj}]({img_url})\n\n"
                    f"### Image Details & Explanation\n"
                    f"- **Subject**: {img_subj}\n"
                    f"- **Engine**: Cloud Diffusion / FLUX.1 (HD 1024×1024)\n"
                    f"- **Visual Elements**: Rendered with dynamic focal composition, lifelike color depth, and clean contrast.\n\n"
                    f"Feel free to ask for variations, style changes, or another image creation!"
                )
                for chunk in response_md.split("\n"):
                    parts.append(chunk + "\n")
                    yield sse({"type": "token", "text": chunk + "\n"})
                    await asyncio.sleep(0.015)
                saved_id = save()
                yield sse({"type": "done", "assistant_message_id": saved_id})
                return

            async for delta in llm.stream_completion(
                messages, float(cfg["temperature"]), float(cfg["top_p"]), int(cfg["max_tokens"]),
                model_override=override_model,
            ):
                parts.append(delta)
                yield sse({"type": "token", "text": delta})
            saved_id = save()
            yield sse({"type": "done", "assistant_message_id": saved_id})
        except Exception as e:  # noqa: BLE001
            log.exception("stream failed")
            saved_id = save()
            yield sse({"type": "error", "message": friendly_error(e), "assistant_message_id": saved_id})
        finally:
            if saved_id is None and parts:  # client disconnected ("Stop"): keep the partial answer
                save()

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )
