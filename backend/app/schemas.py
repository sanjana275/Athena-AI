from typing import Any

DEFAULT_SETTINGS: dict[str, Any] = {
    "system_prompt": "You are a helpful AI assistant. Answer clearly and concisely, and use Markdown when it helps.",
    "temperature": 0.7,
    "top_p": 0.9,
    "max_tokens": 1024,
    "theme": "dark",
}


def merged_settings(raw: dict | None) -> dict[str, Any]:
    out = dict(DEFAULT_SETTINGS)
    out.update(raw or {})
    return out
