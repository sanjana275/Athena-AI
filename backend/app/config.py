from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./chatgpt.db"
    secret_key: str = "dev-secret-change-me"
    frontend_url: str = "http://localhost:3000"

    cookie_name: str = "session"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"  # use "none" (with secure) only if frontend and API are on different sites
    session_days: int = 14

    llm_base_url: str = "https://router.huggingface.co/v1"
    llm_api_key: str = ""
    llm_model: str = "Qwen/Qwen2.5-72B-Instruct"
    llm_max_context_chars: int = 24000

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
        url = self.database_url
        if url.startswith("sqlite"):
            return url
        # Render / Heroku / Neon style URLs
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        if url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        return url

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def google_redirect(self) -> str:
        return self.google_redirect_uri or f"{self.frontend_url.rstrip('/')}/api/auth/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
