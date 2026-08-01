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


class PodcastCue(BaseModel):
    cue_id: str = Field(min_length=1, max_length=80)
    page_number: int | None = Field(default=None, ge=1)
    quote_to_highlight: str | None = Field(default=None, max_length=300)
    narration_text: str = Field(min_length=1, max_length=700)
    action: Literal["scroll", "highlight", "pause", "inspect_table", "inspect_figure"]
    estimated_seconds: int = Field(ge=2, le=90)
    importance: Literal["high", "medium", "low"]


class PodcastResponse(BaseModel):
    episode_title: str
    duration_minutes: int
    script: str
    page_directions: list[str]
    pause_points: list[str]
    chapter_7_takeaways: list[str]
    cues: list[PodcastCue]


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
