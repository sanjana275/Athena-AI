FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 FASTEMBED_CACHE_PATH=/srv/.fastembed
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Bake the small embedding model into the image so the first upload is fast
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5')"
COPY app ./app
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
