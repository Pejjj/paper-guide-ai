from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    llm_provider: Literal["openai", "gemini"] = "openai"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_tts_model: str = "tts-1"
    openai_tts_voice: str = "alloy"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    debug_token: str = ""
    admin_token: str = ""
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_pdf_bucket: str = "pdfs"
    supabase_audio_bucket: str = "audio"
    frontend_url: str = "http://localhost:3000"
    additional_cors_origins: str = ""
    max_upload_mb: int = Field(default=25, ge=1, le=100)
    public_max_pages: int = Field(default=50, ge=1, le=500)
    public_max_guided_readings_per_day: int = Field(default=3, ge=1, le=100)
    public_max_questions_per_day: int = Field(default=20, ge=1, le=500)
    public_max_section_intros_per_day: int = Field(default=10, ge=1, le=200)
    sample_pdf_url: str = "https://rosap.ntl.bts.gov/view/dot/41551/dot_41551_DS1.pdf"
    sample_source_url: str = "https://rosap.ntl.bts.gov/view/dot/41551"
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        extra = [origin.strip() for origin in self.additional_cors_origins.split(",") if origin.strip()]
        return list(dict.fromkeys(["http://localhost:3000", self.frontend_url, *extra]))


@lru_cache
def get_settings() -> Settings:
    return Settings()
