import json
import logging
from typing import AsyncIterator
import httpx
from openai import AsyncOpenAI

from ..config import settings

log = logging.getLogger("llm")

DEFAULT_SYSTEM = (
    "You are Athena, a world-class, exceptionally intelligent, thoughtful, and highly articulate AI assistant, "
    "operating at the highest level of conversational capability comparable to ChatGPT (GPT-4o).\n\n"
    "### Core Principles & Instructions:\n"
    "1. Comprehensive Knowledge & Deep Understanding:\n"
    "   - Answer questions across ALL domains: computer science, software engineering, debugging, algorithms, "
    "mathematics with rigorous step-by-step calculations, natural and physical sciences, history, literature, philosophy, "
    "business strategy, career guidance, resume preparation, creative writing, and everyday problem-solving.\n"
    "   - Always address the exact question and core intent of the user. Never provide superficial, evasive, or irrelevant filler.\n\n"
    "2. High Quality & Structured Communication:\n"
    "   - Use clean, modern GitHub Flavored Markdown.\n"
    "   - Structure responses logically using clear headings (##, ###), bullet points, numbered sequential steps, bold emphasis, "
    "and Markdown tables where appropriate.\n"
    "   - When writing code, always use the correct language tag (e.g., ```python, ```typescript, ```html, ```sql), provide complete, "
    "runnable, production-grade solutions, and explain lines or logic step by step when requested.\n"
    "   - Calibrate response depth: give direct, concise answers to simple factual queries, and deep, comprehensive, well-structured "
    "breakdowns to complex or open-ended topics.\n"
    "   - Never truncate, cut off, or leave explanations incomplete.\n\n"
    "3. Conversational Context & Multi-Turn Awareness:\n"
    "   - You possess continuous conversational memory. Seamlessly understand pronouns and references to earlier turns "
    "(e.g., 'Give examples', 'Explain the second one', 'Rewrite that in Python', 'Show me how to test it').\n"
    "   - Do not ask users to repeat themselves when the context is available in the chat history.\n\n"
    "4. Document & Presentation Generation:\n"
    "   - You have native, built-in capabilities to generate and export documents in PDF and PowerPoint (PPTX) presentation formats.\n"
    "   - When a user asks for content in PDF or as a presentation/PPT, deliver the complete, beautifully sectioned text "
    "(or slide-by-slide structure for presentations), and inform them that they can click the Download PDF or Download PPT "
    "buttons directly on your message bubble to save their file.\n\n"
    "5. Factuality & Search Integration:\n"
    "   - Provide accurate, verified information. If search context or live data is provided in the prompt, synthesize it seamlessly.\n"
    "   - Never hallucinate false citations, broken links, or fictional claims. If something is genuinely unknown or speculative, state it honestly.\n\n"
    "6. Mathematical & Scientific Formula Presentation:\n"
    "   - Make mathematical formulas, equations, and calculations clear, clean, and intuitive for users to understand.\n"
    "   - Avoid raw, confusing LaTeX dollar signs and markup like `$n^2 = n \\times n$` or `$\\mathbf{1}$` in ordinary answers. "
    "Instead, use clean Unicode superscripts and mathematical symbols: n² = n × n, n³ = n × n × n, 1² = 1 × 1 = 1, 2² = 2 × 2 = 4, "
    "(-2)² = 4, √x, ±, ÷, ×, etc., or clean formatted code/math blocks.\n"
    "   - Always explain mathematical operations step by step in plain, accessible language so users can immediately understand the reasoning without deciphering cryptic markup symbols."
)

_client: AsyncOpenAI | None = None


def client() -> AsyncOpenAI:
    global _client
    api_key = settings.effective_llm_api_key
    base_url = settings.effective_llm_base_url
    if _client is None or getattr(_client, "api_key", None) != api_key:
        _client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=120)
    return _client


def openrouter_client() -> AsyncOpenAI:
    key = settings.openai_api_key or ""
    return AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=key, timeout=120)


def build_messages(
    system_prompt: str,
    history: list[tuple[str, str]],
    sources: list[dict],
    search_context: str = "",
    budget_chars: int | None = None,
) -> list[dict]:
    """System prompt (+ retrieved excerpts / search context) + as much recent history as fits the budget."""
    budget = budget_chars or settings.llm_max_context_chars
    system = (system_prompt or "").strip() or DEFAULT_SYSTEM

    if search_context:
        system += (
            "\n\n### Verified Live Real-Time Search Context:\n"
            "The following live information was retrieved from verified real-time sources to answer the user's inquiry:\n"
            f"{search_context}\n"
            "Use this live information to provide an accurate, up-to-date answer."
        )

    if sources:
        ctx = "\n\n".join(
            f"[{i}] {s['filename']} ({s['location']})\n{s['content']}" for i, s in enumerate(sources, 1)
        )
        system += (
            "\n\n### Uploaded Document Excerpts (RAG):\n"
            "The user has uploaded documents. Use the excerpts below to answer their question. "
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
    messages: list[dict],
    temperature: float,
    top_p: float,
    max_tokens: int,
    model_override: str | None = None,
) -> AsyncIterator[str]:
    # 1. Primary: Groq / Configured LLM (e.g. openai/gpt-oss-120b or openai/gpt-4o-mini)
    primary_model = model_override or settings.llm_model or "openai/gpt-oss-120b"

    # Route GPT-4o mini to OpenRouter if requested
    if primary_model in ("openai/gpt-4o-mini", "gpt-4o-mini"):
        if settings.openai_api_key:
            try:
                or_client = openrouter_client()
                stream = await or_client.chat.completions.create(
                    model="openai/gpt-4o-mini",
                    messages=messages,  # type: ignore[arg-type]
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                )
                has_content = False
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta.content
                    if delta:
                        has_content = True
                        yield delta
                if has_content:
                    return
            except Exception as e:
                log.warning("GPT-4o-mini via OpenRouter failed: %s. Falling back to Groq 120B.", e)
        primary_model = "openai/gpt-oss-120b"

    try:
        stream = await client().chat.completions.create(
            model=primary_model,
            messages=messages,  # type: ignore[arg-type]
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            stream=True,
        )
        has_content = False
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                has_content = True
                yield delta
        if has_content:
            return
    except Exception as e:
        log.warning("Primary LLM (%s) failed: %s. Trying secondary backup.", primary_model, e)

    # 2. Secondary: Groq Qwen model (qwen/qwen3.8-27b)
    if primary_model != "qwen/qwen3.8-27b":
        try:
            stream = await client().chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=messages,  # type: ignore[arg-type]
                temperature=temperature,
                top_p=top_p,
                max_tokens=max_tokens,
                stream=True,
            )
            has_content = False
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta.content
                if delta:
                    has_content = True
                    yield delta
            if has_content:
                return
        except Exception as e:
            log.warning("Secondary Groq backup (qwen/qwen3.8-27b) failed: %s", e)

    # 3. Tertiary: OpenRouter (Gemma 4 31B or Nemotron)
    if settings.openai_api_key:
        try:
            or_client = openrouter_client()
            stream = await or_client.chat.completions.create(
                model="google/gemma-4-31b-it:free",
                messages=messages,  # type: ignore[arg-type]
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            has_content = False
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta.content
                if delta:
                    has_content = True
                    yield delta
            if has_content:
                return
        except Exception as e:
            log.warning("OpenRouter backup failed: %s", e)

    # 4. Resilient Cloud Fallback (Pollinations OpenAI-compatible)
    try:
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
    except Exception as e:
        log.warning("Cloud fallback failed: %s", e)

    yield "I encountered a temporary connection issue while reaching the AI models. Please try sending your message again in a moment."


VISION_MODEL = "nvidia/nemotron-3.5-super-vl:free"


async def stream_vision_completion(
    system_prompt: str,
    text_question: str,
    image_data_url: str,
    temperature: float,
    max_tokens: int,
) -> AsyncIterator[str]:
    """Analyze and explain an uploaded image using the verified vision model."""
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

    # Try OpenRouter Nemotron Super VL
    if settings.openai_api_key:
        try:
            or_client = openrouter_client()
            stream = await or_client.chat.completions.create(
                model=VISION_MODEL,
                messages=messages,  # type: ignore[arg-type]
                temperature=min(temperature, 0.7),
                max_tokens=max(max_tokens, 1000),
                stream=True,
            )
            has_content = False
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                c = getattr(delta, "content", None)
                if c:
                    has_content = True
                    yield c
            if has_content:
                return
        except Exception as e:
            log.warning("OpenRouter vision model failed: %s", e)

    yield (
        "I received your image, but the vision processing model is currently taking a moment to initialize. "
        "Please provide the image again or describe the topic and I will be happy to assist you!"
    )


async def generate_image_prompt(raw_subject: str) -> str:
    """Intelligently enrich an image generation prompt for maximum visual accuracy,

    especially for brand logos, recognizable symbols, and natural subjects.
    """
    subject = raw_subject.strip()
    low = subject.lower()

    # Pre-tuned high-fidelity expansions for common misrendered symbols
    known_expansions = {
        "python logo": "Official Python programming language logo, two intertwined stylized snakes in cobalt blue and warm yellow colors, minimalist flat vector emblem on a clean white background, high resolution, sharp vector edges",
        "python": "Official Python programming language logo, two intertwined stylized snakes in blue and yellow colors, clean flat vector graphics, white background",
        "apple logo": "Official Apple company logo, minimalist monochrome bitten apple silhouette on a clean smooth background, perfect clean geometric design",
        "domestic animal": "A friendly domestic golden retriever dog and a domestic cat resting together in a bright, modern living room, soft natural sunlight, lifelike fur details, authentic photorealistic pet photograph",
        "domestic animals": "A high-quality educational chart of common domestic animals including a dog, cat, cow, horse, and sheep, cleanly arranged on a soft neutral background, realistic and friendly illustration",
    }
    for k, exp in known_expansions.items():
        if low == k or low == f"image of {k}" or low == f"a {k}":
            return exp

    for model_candidate in ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"]:
        try:
            resp = await client().chat.completions.create(
                model=model_candidate,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert diffusion image prompt engineer. "
                            "Given the user's raw image description, expand it into a visually accurate, "
                            "photorealistic or clean graphic prompt that captures the exact subject intended.\n"
                            "Rules:\n"
                            "- If it's a known logo or brand (e.g. Python, Linux, Apple), describe its authentic official design, shapes, and colors accurately.\n"
                            "- If it is a generic category like 'domestic animal', depict an authentic, recognizable domestic pet (like a dog or cat) in a realistic setting.\n"
                            "- Preserve all requested objects, colors, and visual styles.\n"
                            "- Output ONLY the refined visual prompt text. No explanation, quotes, or markdown."
                        ),
                    },
                    {"role": "user", "content": subject[:250]},
                ],
                temperature=0.3,
                max_tokens=80,
                timeout=5.0,
            )
            if resp.choices and resp.choices[0].message and resp.choices[0].message.content:
                expanded = resp.choices[0].message.content.strip().strip('"\'`').replace("\n", " ")
                if len(expanded) > 10:
                    return expanded
        except Exception as e:
            log.warning("Image prompt expansion failed on %s: %s", model_candidate, e)

    # Fallback to enhanced description
    return f"{subject}, photorealistic, high quality, accurate details, clean composition, natural lighting"


async def generate_chat_title(context_input: str | list[tuple[str, str]]) -> str:
    """Generate a clean, comprehensive 2 to 5 word topic title for the chat summarizing the entire conversation context."""
    if isinstance(context_input, list):
        # Extract user inquiries and context
        turns = [f"User: {c[:120]}" for r, c in context_input if r == "user" and c.strip()]
        cleaned = " | ".join(turns[:4])
    else:
        cleaned = str(context_input).strip().replace("\r\n", " ").replace("\n", " ")

    if not cleaned:
        return "New chat"

    # Fast title generation with Groq model
    for model_candidate in ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]:
        try:
            resp = await client().chat.completions.create(
                model=model_candidate,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a ChatGPT conversation title generator.\n"
                            "Generate an accurate, comprehensive 2 to 5 word topic title in Title Case summarizing what was asked or discussed across the conversation.\n"
                            "Rules:\n"
                            "- Output ONLY the 2 to 5 word title in Title Case.\n"
                            "- Synthesize the overarching topic if multiple related questions were asked.\n"
                            "- Do NOT include punctuation, quotes, or conversational phrases.\n\n"
                            "Examples:\n"
                            "User: 'what is AI' | User: 'give machine learning and deep learning examples' -> 'AI and Deep Learning'\n"
                            "User: 'can you create a domestic animal chart' -> 'Domestic Animals Chart'\n"
                            "User: 'what are the differences between python and javascript' -> 'Python vs JavaScript'\n"
                            "User: 'make a presentation on infant neuro ai assistant' -> 'Infant Neuro-AI Presentation'\n"
                            "User: 'how to sort an array using quicksort in python' -> 'Python QuickSort Algorithm'\n"
                            "User: 'prepare for sbi po and bank exams' -> 'Bank Exam Preparation Strategy'"
                        ),
                    },
                    {"role": "user", "content": cleaned[:400]},
                ],
                temperature=0.2,
                max_tokens=20,
                timeout=6.0,
            )
            if resp.choices and resp.choices[0].message and resp.choices[0].message.content:
                raw_title = resp.choices[0].message.content.strip().strip('"\'`').rstrip('.').strip()
                if raw_title and len(raw_title) < 55 and "\n" not in raw_title:
                    return raw_title
        except Exception as e:
            log.warning("Title generation (%s) failed: %s", model_candidate, e)

    # Intelligent linguistic fallback (topic extraction)
    import re
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

    stop_words = {"a", "an", "the", "in", "on", "at", "for", "with", "about", "to", "of", "and", "or", "me", "my", "you", "your", "some", "any", "all", "these", "user"}
    keywords = [w.capitalize() for w in re.findall(r"\b[a-zA-Z0-9_\+#-]+\b", core) if w.lower() not in stop_words]
    if keywords:
        return " ".join(keywords[:5])[:45]
    return "New chat"
