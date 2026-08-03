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
    is_sample: bool = False
    source_url: str | None = None
    subtitle: str | None = None
    source_attribution: str | None = None
    read_only: bool = False


class PageOut(BaseModel):
    document_id: UUID
    page_number: int
    text: str
    detected_headings: list[str] = []
    detected_references: list[str] = []
    physical_page_number: int | None = None
    printed_page_label: str | None = None
    detected_formulas: list[dict] = []
    detected_tables: list[dict] = []
    detected_figures: list[dict] = []


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
    scope_type: Literal["document", "chapter", "section", "page_range", "formula", "method", "concept"] = "document"
    page_start: int | None = Field(default=None, ge=1)
    page_end: int | None = Field(default=None, ge=1)
    mode: Literal["normal", "simple", "technical", "formulas", "exam"] = "normal"


class GuidedReadingRequest(DocumentRequest):
    duration_minutes: int = Field(default=8, ge=3, le=20)
    scope_type: Literal["document", "chapter", "section", "page_range", "formula", "method", "concept"] = "document"
    page_start: int | None = Field(default=None, ge=1)
    page_end: int | None = Field(default=None, ge=1)
    section_id: str | None = None
    chapter_id: str | None = None
    focus_text: str | None = Field(default=None, max_length=500)
    learning_mode: Literal["normal", "simple_english", "technical", "formulas_only", "exam_study", "method_reproduction"] = "normal"


class PodcastCue(BaseModel):
    cue_id: str = Field(min_length=1, max_length=80)
    cue_title: str = Field(default="Guided cue", min_length=1, max_length=160)
    page_number: int | None = Field(default=None, ge=1)
    page_range: list[int] | None = None
    quote_to_highlight: str | None = Field(default=None, max_length=300)
    narration_text: str = Field(min_length=1, max_length=700)
    action: Literal["scroll", "highlight", "pause", "inspect_table", "inspect_figure", "inspect_formula", "compare_pages", "checkpoint_question"]
    estimated_seconds: int = Field(ge=2, le=90)
    importance: Literal["high", "medium", "low"]
    prerequisite: bool = False
    target_item_type: Literal["heading", "paragraph", "formula", "table", "figure", "method_step"] = "paragraph"
    checkpoint_question: str | None = Field(default=None, max_length=400)


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
    scope_type: Literal["document", "chapter", "section", "page"] = "document"
    page_start: int | None = Field(default=None, ge=1)
    page_end: int | None = Field(default=None, ge=1)


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


class AnalyticsEventCreate(BaseModel):
    event_name: Literal[
        "page_view", "sample_document_opened", "pdf_uploaded", "guided_reading_generated",
        "guided_reading_started", "section_intro_generated", "ask_document_used",
        "response_updated_by_chat", "chapter_map_generated",
    ]
    path: str = Field(max_length=500)
    anonymous_session_id: str = Field(min_length=8, max_length=100)
    metadata: dict = Field(default_factory=dict)


class SectionItem(BaseModel):
    section_id: str
    section_title: str
    page_start: int | None = None
    page_end: int | None = None
    detected_headings: list[str]
    key_terms: list[str]
    formulas_detected: list[str]
    tables_figures_detected: list[str]
    why_this_section_matters: str
    source: Literal["pdf_outline", "body_heading_match", "toc_unresolved", "ai_inferred"] = "ai_inferred"
    confidence: Literal["high", "medium", "low"] = "low"
    warning: str | None = None
    printed_page_start: str | None = None
    printed_page_end: str | None = None
    detected_items: list[dict] = []


class ChapterItem(BaseModel):
    chapter_id: str
    chapter_title: str
    page_start: int | None = None
    page_end: int | None = None
    confidence: Literal["high", "medium", "low"]
    sections: list[SectionItem]
    source: Literal["pdf_outline", "body_heading_match", "toc_unresolved", "ai_inferred"] = "ai_inferred"
    warning: str | None = None
    printed_page_start: str | None = None
    printed_page_end: str | None = None
    detected_items: list[dict] = []


class DocumentStructureResponse(BaseModel):
    document_title: str
    detected_document_type: Literal["paper", "book", "report", "manual", "unknown"]
    chapters: list[ChapterItem]
    global_reading_advice: str
    recommended_learning_paths: list[str]


class SectionIntroRequest(DocumentRequest):
    section_id: str | None = None
    section_title: str | None = None
    page_start: int = Field(ge=1)
    page_end: int = Field(ge=1)
    user_level: Literal["simple", "intermediate", "advanced"] = "intermediate"
    focus: Literal["overview", "theory", "formulas", "method", "results", "implementation"] = "overview"


class SectionIntroResponse(BaseModel):
    section_title: str
    page_range: list[int]
    plain_language_intro: str
    technical_summary: str
    key_terms: list[str]
    formulas_to_understand: list[str]
    prerequisite_concepts: list[str]
    where_else_to_look_in_document: list[str]
    step_by_step_learning_plan: list[str]
    warnings_or_common_confusions: list[str]
    suggested_questions_to_ask: list[str]


class MethodWalkthroughRequest(DocumentRequest):
    page_start: int = Field(ge=1)
    page_end: int = Field(ge=1)
    user_goal: Literal["understand", "reproduce", "implement", "study for exam", "literature review"] = "understand"


class FormulaItem(BaseModel):
    formula_text: str
    page_number: int | None = None
    variable_meanings: list[str]
    variable_meanings_missing: bool


class MethodStep(BaseModel):
    step_id: str
    instruction: str
    page_number: int | None = None
    required: bool


class MethodWalkthroughResponse(BaseModel):
    method_name: str
    page_range: list[int]
    objective: str
    required_inputs: list[str]
    assumptions: list[str]
    formulas: list[FormulaItem]
    step_by_step_procedure: list[MethodStep]
    decision_points: list[str]
    outputs: list[str]
    validation_checks: list[str]
    where_results_tables_figures_are_discussed: list[str]
    missing_information: list[str]
    references_inside_document: list[str]
    suggested_external_background_topics: list[str]
    required_reading: list[str]
    optional_or_skimmable: list[str]
    prerequisites_to_read_first: list[str]


class ConceptGuideRequest(DocumentRequest):
    concept_or_question: str = Field(min_length=2, max_length=500)
    page_start: int | None = Field(default=None, ge=1)
    page_end: int | None = Field(default=None, ge=1)


class ConceptGuideResponse(BaseModel):
    concept: str
    simple_explanation: str
    technical_explanation: str
    where_defined: list[str]
    where_used: list[str]
    formulas_involving_concept: list[str]
    tables_figures_to_check: list[str]
    recommended_reading_sequence: list[str]
    prerequisite_concepts: list[str]
    gaps_not_found_in_document: list[str]


class UpdateResponseRequest(DocumentRequest):
    response_id: UUID | None = None
    original_response_type: Literal["reading_route", "guided_reading", "chapter_map", "section_intro", "method_walkthrough", "concept_guide", "ask_answer"]
    original_response_json: dict | str
    user_instruction: str = Field(min_length=2, max_length=1000)
    current_context: dict = Field(default_factory=dict)


class UpdateResponseResult(BaseModel):
    response_id: UUID
    version_number: int
    updated_response: dict | str
    explanation_of_changes: str
    user_instruction: str


class AIOutputOut(BaseModel):
    id: UUID
    document_id: UUID
    output_type: str
    scope_type: str
    scope_metadata: dict
    payload: dict | str
    created_at: datetime
    updated_at: datetime


class AIOutputVersionOut(BaseModel):
    id: UUID
    ai_output_id: UUID
    version_number: int
    instruction: str | None = None
    payload: dict | str
    created_at: datetime
