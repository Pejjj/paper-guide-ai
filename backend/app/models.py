from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentOut(BaseModel):
    id: UUID
    title: str
    original_filename: str
    storage_path: str
    page_count: int | None = None
    status: str
    created_at: datetime
    signed_url: str | None = None


class PageOut(BaseModel):
    document_id: UUID
    page_number: int
    text: str
    detected_headings: list[str] = []
    detected_references: list[str] = []


class DocumentRequest(BaseModel):
    document_id: UUID


class ReadingRouteItem(BaseModel):
    priority: Literal["Must read", "Skim", "Optional"]
    section_title: str
    page_start: int | None = None
    page_end: int | None = None
    why_it_matters: str
    what_to_extract: list[str]
    chapter_7_use: str


class ReadingRouteResponse(BaseModel):
    document_title: str
    overall_goal: str
    recommended_reading_order: list[ReadingRouteItem]
    skip_or_lightly_skim: list[str]
    key_tables_figures: list[str]
    citation_roles: list[str]


class PodcastRequest(DocumentRequest):
    duration_minutes: int = Field(default=8, ge=3, le=20)


class PodcastResponse(BaseModel):
    episode_title: str
    duration_minutes: int
    script: str
    page_directions: list[str]
    pause_points: list[str]
    chapter_7_takeaways: list[str]


class AskRequest(DocumentRequest):
    question: str = Field(min_length=2, max_length=1000)


class AskResponse(BaseModel):
    answer: str


class TTSRequest(DocumentRequest):
    script: str = Field(min_length=1, max_length=40_000)


class TTSResponse(BaseModel):
    signed_url: str


class NoteCreate(DocumentRequest):
    content: str = Field(min_length=1, max_length=20_000)
    page_number: int | None = Field(default=None, ge=1)


class NoteOut(BaseModel):
    id: UUID
    document_id: UUID
    content: str
    page_number: int | None
    created_at: datetime

