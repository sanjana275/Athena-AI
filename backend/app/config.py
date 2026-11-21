from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "backend/.env"), extra="ignore")

    database_url: str = "sqlite:///./chatgpt.db"
    secret_key: str = "dev-secret-change-me"
    frontend_url: str = "http://localhost:3000"

    cookie_name: str = "session"
    cookie_secure: bool = True
    cookie_samesite: str = "none"  # "none" with secure=True allows cross-domain frontend and API
    session_days: int = 14

    groq_api_key: str = ""
    openai_api_key: str = ""
    huggingface_api_key: str = ""
    gemini_api_key: str = ""

    llm_base_url: str = "https://api.groq.com/openai/v1"
    llm_api_key: str = ""
    llm_model: str = "openai/gpt-oss-120b"
    llm_max_context_chars: int = 40000

    @property
    def effective_llm_api_key(self) -> str:
        return self.llm_api_key or self.groq_api_key or ""

    @property
    def effective_llm_base_url(self) -> str:
        return self.llm_base_url or "https://api.groq.com/openai/v1"

    embed_provider: str = "fastembed"  # "fastembed" | "openai"
    embed_model: str = "BAAI/bge-small-en-v1.5"
    embed_dim: int = 384
    embed_base_url: str = ""
    embed_api_key: str = ""

    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    resend_api_key: str = ""
    email_from: str = "ChatGPT Platform <onboarding@resend.dev>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    max_upload_mb: int = 20
    max_chunks_per_doc: int = 3000

    @property
    def sqlalchemy_url(self) -> str:
        url = (self.database_url or "").strip()
        if not url or url.startswith("sqlite"):
            return url or "sqlite:///./chatgpt.db"
        # Render / Heroku / Neon style URLs
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url

    @property
    def is_sqlite(self) -> bool:
        url = (self.database_url or "").strip()
        return not url or url.startswith("sqlite")

    @property
    def google_redirect(self) -> str:
        return self.google_redirect_uri or f"{self.frontend_url.rstrip('/')}/api/auth/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
