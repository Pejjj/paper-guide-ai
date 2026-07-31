from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_tts_model: str = "tts-1"
    openai_tts_voice: str = "alloy"
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_pdf_bucket: str = "pdfs"
    supabase_audio_bucket: str = "audio"
    frontend_url: str = "http://localhost:3000"
    additional_cors_origins: str = ""
    max_upload_mb: int = Field(default=25, ge=1, le=100)
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        extra = [origin.strip() for origin in self.additional_cors_origins.split(",") if origin.strip()]
        return list(dict.fromkeys(["http://localhost:3000", self.frontend_url, *extra]))


@lru_cache
def get_settings() -> Settings:
    return Settings()

