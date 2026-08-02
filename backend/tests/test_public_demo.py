from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models import (
    AnalyticsEventCreate,
    ChapterItem,
    DocumentStructureResponse,
    SectionIntroResponse,
    UpdateResponseRequest,
)
from app.routes import ai, analytics, documents
from app.services import openai_service, supabase_service


def test_chapter_map_schema_validation() -> None:
    result = DocumentStructureResponse(
        document_title="Manual",
        detected_document_type="manual",
        chapters=[ChapterItem(chapter_id="c1", chapter_title="Start", page_start=1, page_end=2, confidence="high", sections=[])],
        global_reading_advice="Read in order.",
        recommended_learning_paths=["Start with chapter 1"],
    )
    assert result.chapters[0].page_start == 1


def test_chapter_map_rejects_invented_pages(monkeypatch) -> None:
    generated = DocumentStructureResponse(
        document_title="Manual",
        detected_document_type="manual",
        chapters=[ChapterItem(chapter_id="c1", chapter_title="Start", page_start=99, page_end=100, confidence="low", sections=[])],
        global_reading_advice="Read carefully.",
        recommended_learning_paths=[],
    )
    monkeypatch.setattr(openai_service, "_structured", lambda *args: generated)
    result = openai_service.chapter_map("Manual", [{"page_number": 1, "text": "Start"}])
    assert result.chapters[0].page_start is None
    assert result.chapters[0].page_end is None


def test_section_intro_range_is_grounded(monkeypatch) -> None:
    generated = SectionIntroResponse(
        section_title="Method", page_range=[88, 99], plain_language_intro="Intro", technical_summary="Summary",
        key_terms=[], formulas_to_understand=[], prerequisite_concepts=[], where_else_to_look_in_document=[],
        step_by_step_learning_plan=[], warnings_or_common_confusions=[], suggested_questions_to_ask=[],
    )
    monkeypatch.setattr(openai_service, "_structured", lambda *args: generated)
    result = openai_service.section_intro("Paper", [{"page_number": 4, "text": "Method"}, {"page_number": 5, "text": "Results"}], "Method", "simple", "overview")
    assert result.page_range == [4, 5]


def test_analytics_event_creation(monkeypatch) -> None:
    recorded = []
    monkeypatch.setattr(analytics, "track_event", lambda *args: recorded.append(args))
    payload = AnalyticsEventCreate(event_name="page_view", path="/", anonymous_session_id="session-123", metadata={"area": "home"})
    assert analytics.create_event(payload, "user-id") == {"accepted": True}
    assert recorded[0][0] == "page_view"


def test_public_usage_limit_returns_friendly_429(monkeypatch) -> None:
    class Query:
        count = 3
        data = []
        def select(self, *args, **kwargs): return self
        def eq(self, *args, **kwargs): return self
        def gte(self, *args, **kwargs): return self
        def execute(self): return self
    monkeypatch.setattr(supabase_service, "get_supabase", lambda: SimpleNamespace(table=lambda name: Query()))
    with pytest.raises(HTTPException) as raised:
        supabase_service.enforce_daily_limit("guided_reading_generated", "session-123", 3, "guided readings")
    assert raised.value.status_code == 429
    assert "try again tomorrow" in raised.value.detail.lower()


def test_update_response_creates_version(monkeypatch) -> None:
    monkeypatch.setattr(ai, "_pages_or_error", lambda *args: ({}, [{"page_number": 1, "text": "Evidence"}]))
    monkeypatch.setattr(openai_service, "update_structured_response", lambda *args: ({"answer": "Updated [p. 1]"}, "Changed safely"))
    monkeypatch.setattr(ai, "save_ai_output", lambda *args, **kwargs: {"id": "00000000-0000-0000-0000-000000000010"})
    monkeypatch.setattr(ai, "add_ai_output_version", lambda *args, **kwargs: ({}, 2))
    monkeypatch.setattr(ai, "track_event", lambda *args, **kwargs: None)
    payload = UpdateResponseRequest(
        document_id="00000000-0000-0000-0000-000000000001",
        original_response_type="ask_answer",
        original_response_json="Original",
        user_instruction="Make it simpler",
    )
    result = ai.update_response(payload, "user-id", "session-123")
    assert result.version_number == 2
    assert result.user_instruction == "Make it simpler"


def test_fhwa_sample_presentation_is_read_only_and_attributed() -> None:
    presented = documents._present_document({"is_sample": True, "metadata": {}})
    assert presented["read_only"] is True
    assert presented["subtitle"] == documents.SAMPLE_SUBTITLE
    assert presented["source_attribution"] == "Federal Highway Administration / National Highway Institute, FHWA-NHI-06-088"
