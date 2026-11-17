import json
import logging
from typing import AsyncIterator
import httpx
from openai import AsyncOpenAI

from ..config import settings

log = logging.getLogger("llm")

DEFAULT_SYSTEM = (
    "You are Athena, a brilliant, thoughtful, and highly accurate AI assistant.\n"
    "Answer user questions across all domains with full accuracy, depth, structure, and clean GitHub Markdown formatting.\n"
    "If a question or request is unclear, incomplete, or ambiguous, express gratitude for the inquiry and politely ask for confirmation or clarification.\n"
    "DOCUMENT AND PRESENTATION GENERATION CAPABILITIES:\n"
    "You have full built-in capabilities to generate and export documents in PDF and PowerPoint (PPT) presentation formats.\n"
    "When a user asks to create or provide content in PDF form, as a document, or as a presentation/PPT:\n"
    "- NEVER refuse or say 'I cannot create files directly'.\n"
    "- Present the complete, beautifully structured content with clear headings, bullet points, and clean sections (or slide-by-slide structure for presentations).\n"
    "- Conclude with a warm note confirming that their document/presentation is ready to download using the Download PDF or Download PPT buttons right on your response."
)

_client: AsyncOpenAI | None = None


def client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = settings.llm_api_key or ""
        base_url = settings.llm_base_url or "https://api.groq.com/openai/v1"
        _client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=120)
    return _client


def build_messages(
    system_prompt: str,
    history: list[tuple[str, str]],
    sources: list[dict],
    budget_chars: int | None = None,
) -> list[dict]:
    """System prompt (+ retrieved excerpts) + as much recent history as fits the budget."""
    budget = budget_chars or settings.llm_max_context_chars
    system = (system_prompt or "").strip() or DEFAULT_SYSTEM
    if sources:
        ctx = "\n\n".join(
            f"[{i}] {s['filename']} ({s['location']})\n{s['content']}" for i, s in enumerate(sources, 1)
        )
        system += (
            "\n\nThe user has uploaded documents. Use the excerpts below to answer. "
            "Cite the excerpt numbers like [1] when you rely on them. "
            "If the excerpts do not contain the answer, say so clearly instead of guessing.\n\n" + ctx
        )
    used = len(system)
    kept: list[dict] = []
    for role, content in reversed(history):
        if kept and used + len(content) > budget:
            break
        kept.append({"role": role, "content": content})
        used += len(content)
    return [{"role": "system", "content": system}, *reversed(kept)]


async def stream_completion(
    messages: list[dict], temperature: float, top_p: float, max_tokens: int,
    model_override: str | None = None,
) -> AsyncIterator[str]:
    # 1. Primary: Groq / Configured LLM
    try:
        model = model_override or settings.llm_model or "llama-3.3-70b-versatile"
        stream = await client().chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
        return
    except Exception as e:
        log.warning("Primary LLM endpoint error: %s. Falling back to free cloud inference.", e)

    # 2. Resilient Cloud Fallback (OpenAI-compatible)
    async with httpx.AsyncClient(timeout=45.0) as http_client:
        payload = {
            "messages": messages,
            "model": "openai",
            "stream": True,
        }
        async with http_client.stream(
            "POST",
            "https://text.pollinations.ai/",
            json=payload,
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
        ) as resp:
            if resp.status_code == 200:
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            item = json.loads(data_str)
                            delta = item.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                yield delta
                        except Exception:
                            pass
                return

    # 3. Simple fallback
    yield "Thank you for reaching out! I am here to help you. Could you please confirm or clarify your question so I can provide the most accurate answer?"


VISION_MODEL = "llama-3.2-11b-vision-preview"


async def stream_vision_completion(
    system_prompt: str,
    text_question: str,
    image_data_url: str,
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[str]:
    """Use Groq's vision model to explain/analyse an uploaded image."""
    system = (system_prompt or "").strip() or DEFAULT_SYSTEM
    messages = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": text_question or "Please describe and explain this image in detail."},
                {"type": "image_url", "image_url": {"url": image_data_url}},
            ],
        },
    ]
    try:
        stream = await client().chat.completions.create(
            model=VISION_MODEL,
            messages=messages,  # type: ignore[arg-type]
            temperature=min(temperature, 1.0),
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
        return
    except Exception as e:
        log.warning("Vision model error: %s — falling back to description.", e)

    # Fallback: Tell user the image was received but vision is unavailable
    yield (
        "I received your image, but the vision model is currently unavailable. "
        "Please describe what's in the image in text and I will help you with that!\n\n"
        f"*(Vision model `{VISION_MODEL}` did not respond: {e})*"
    )


async def generate_chat_title(prompt: str) -> str:
    """Generate a clean, concise 2-4 word summary title for the chat, like real ChatGPT."""
    cleaned = prompt.strip().replace("\r\n", " ").replace("\n", " ")
    if not cleaned:
        return "New chat"

    # 1. Primary: Fast Groq model (llama-3.1-8b-instant or llama-3.3-70b-versatile)
    for model_candidate in ["llama-3.1-8b-instant", settings.llm_model or "llama-3.3-70b-versatile"]:
        try:
            resp = await client().chat.completions.create(
                model=model_candidate,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a ChatGPT conversation title generator.\n"
                            "Generate an ultra-concise, natural 2 to 4 word topic title summarizing what was asked or discussed.\n"
                            "Rules:\n"
                            "- Output ONLY the 2 to 4 word title in Title Case.\n"
                            "- Do NOT repeat the prompt word-for-word.\n"
                            "- Do NOT include punctuation, quotes, or conversational phrases.\n\n"
                            "Examples:\n"
                            "User: 'can you create a domestic animal chart for kindergarten children' -> 'Domestic Animals Chart'\n"
                            "User: 'what are the differences between python and javascript' -> 'Python vs JavaScript'\n"
                            "User: 'give all these contents in pdf form' -> 'Document PDF Export'\n"
                            "User: 'make a presentation on infant neuro ai assistant' -> 'Infant Neuro-AI Deck'\n"
                            "User: 'how to sort an array using quicksort in python' -> 'Python QuickSort'\n"
                            "User: 'prepare for sbi po and bank exams' -> 'Bank Exam Preparation'"
                        ),
                    },
                    {"role": "user", "content": cleaned[:300]},
                ],
                temperature=0.2,
                max_tokens=15,
                timeout=5.0,
            )
            if resp.choices and resp.choices[0].message and resp.choices[0].message.content:
                raw_title = resp.choices[0].message.content.strip().strip('"\'`').rstrip('.').strip()
                if raw_title and len(raw_title) < 45 and "\n" not in raw_title:
                    return raw_title
        except Exception as e:
            log.warning("Groq title generation (%s) failed: %s", model_candidate, e)

    # 2. Resilient Cloud Fallback (Pollinations API)
    try:
        async with httpx.AsyncClient(timeout=6.0) as http_client:
            r = await http_client.post(
                "https://text.pollinations.ai/",
                json={
                    "messages": [
                        {
                            "role": "system",
                            "content": "Generate an ultra-concise 2 to 4 word title summarizing this user question for a chat sidebar. Output ONLY the title.",
                        },
                        {"role": "user", "content": cleaned[:250]},
                    ],
                    "model": "openai",
                },
                headers={"Content-Type": "application/json", "User-Agent": "AthenaAI/1.0"},
            )
            if r.status_code == 200 and r.text:
                candidate = r.text.strip().strip('"\'`').rstrip('.').strip()
                if candidate and len(candidate) < 45 and "\n" not in candidate:
                    return candidate
    except Exception as e:
        log.warning("Pollinations title fallback failed: %s", e)

    # 3. Intelligent linguistic fallback (topic extraction, not raw prompt truncation)
    import re
    # Check for document / presentation intents
    if re.search(r"\b(ppt|pptx|presentation|slides)\b", cleaned, re.IGNORECASE):
        subj = re.sub(r"\b(create|make|give|in|as|a|the|all|these|contents|form|ppt|presentation|slides|for|to)\b", "", cleaned, flags=re.IGNORECASE).strip()
        words = [w.capitalize() for w in subj.split() if len(w) > 2]
        return (f"{' '.join(words[:3])} Presentation" if words else "Presentation Slides")[:36]

    if re.search(r"\b(pdf|document|doc|sheet)\b", cleaned, re.IGNORECASE):
        subj = re.sub(r"\b(create|make|give|in|as|a|the|all|these|contents|form|pdf|document|for|to)\b", "", cleaned, flags=re.IGNORECASE).strip()
        words = [w.capitalize() for w in subj.split() if len(w) > 2]
        return (f"{' '.join(words[:3])} Document" if words else "Document Export")[:36]

    prefixes = [
        r"^can you please (explain|tell me about|create|write|show|make|give me)\s+",
        r"^can you (explain|tell me about|create|write|show|make|give me)\s+",
        r"^could you please (explain|tell me about|create|write|show|make|give me)\s+",
        r"^could you (explain|tell me about|create|write|show|make|give me)\s+",
        r"^please (explain|tell me about|create|write|show|make|give me)\s+",
        r"^tell me about\s+",
        r"^what is the difference between\s+",
        r"^what are the differences between\s+",
        r"^what is the\s+",
        r"^what are the\s+",
        r"^what is\s+",
        r"^what are\s+",
        r"^how do i\s+",
        r"^how can i\s+",
        r"^how to\s+",
        r"^i want to\s+",
        r"^help me with\s+",
        r"^give me\s+",
    ]
    core = cleaned
    for p in prefixes:
        core = re.sub(p, "", core, flags=re.IGNORECASE).strip()

    stop_words = {"a", "an", "the", "in", "on", "at", "for", "with", "about", "to", "of", "and", "or", "me", "my", "you", "your", "some", "any", "all", "these"}
    keywords = [w.capitalize() for w in re.findall(r"\b[a-zA-Z0-9_\+#-]+\b", core) if w.lower() not in stop_words]
    if keywords:
        return " ".join(keywords[:4])[:36]
    return "New chat"

