import threading

from openai import OpenAI

from ..config import settings

_model = None
_lock = threading.Lock()


def _fast():
    global _model
    with _lock:
        if _model is None:
            from fastembed import TextEmbedding

            _model = TextEmbedding(model_name=settings.embed_model)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Blocking. Call from a worker thread (sync endpoints already are)."""
    if not texts:
        return []
    if settings.embed_provider == "openai":
        client = OpenAI(base_url=settings.embed_base_url or None, api_key=settings.embed_api_key)
        out: list[list[float]] = []
        for i in range(0, len(texts), 64):
            r = client.embeddings.create(model=settings.embed_model, input=texts[i : i + 64])
            out.extend(d.embedding for d in r.data)
        return out
    return [[float(x) for x in v] for v in _fast().embed(texts, batch_size=32)]
