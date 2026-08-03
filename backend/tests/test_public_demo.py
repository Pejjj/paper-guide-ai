from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models import (
    AnalyticsEventCreate,
    ChapterItem,
    DefinitionIndexResponse,
    GuidedReadingRequest,
    DocumentStructureResponse,
    SectionIntroResponse,
    UpdateResponseRequest,
)
from app.routes import ai, analytics, documents
from app.services import openai_service, supabase_service
from app.services.pdf_service import _detected_items
from app.services.definition_service import cited_references_for_term, extract_definition_index
from app.services.structure_service import resolve_heading, resolve_structure


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
    result = openai_service.chapter_map("Manual", [{"page_number": 1, "text": "Unrelated body text"}])
    assert result.chapters[0].page_start is None
    assert result.chapters[0].page_end is None


def test_toc_entry_is_not_used_as_body_start() -> None:
    pages = [
        {"page_number": 13, "text": "TABLE OF CONTENTS\n2.0 STRESS AND STRAIN IN SOILS ........ 2-1", "detected_headings": ["2.0 STRESS AND STRAIN IN SOILS ........ 2-1"]},
        {"page_number": 35, "text": "2.0 Stress and Strain in Soils\nBody discussion", "detected_headings": ["2.0 Stress and Strain in Soils"]},
    ]
    assert resolve_heading("2.0 STRESS AND STRAIN IN SOILS", pages)[:3] == (35, "body_heading_match", "high")


def test_toc_only_heading_remains_unresolved() -> None:
    pages = [{"page_number": 13, "text": "TABLE OF CONTENTS\nPURPOSE AND SCOPE ........ 1-1", "detected_headings": ["PURPOSE AND SCOPE ........ 1-1"]}]
    page, source, confidence, warning = resolve_heading("PURPOSE AND SCOPE", pages)
    assert page is None
    assert source == "toc_unresolved"
    assert confidence == "low"
    assert warning


def test_section_ranges_and_printed_labels_are_resolved() -> None:
    result = DocumentStructureResponse(
        document_title="Manual", detected_document_type="manual",
        chapters=[ChapterItem(chapter_id="c", chapter_title="2.0 SOILS", confidence="low", sections=[
            {"section_id": "s1", "section_title": "2.1 BASIC RELATIONSHIPS", "detected_headings": [], "key_terms": [], "formulas_detected": [], "tables_figures_detected": [], "why_this_section_matters": "Core"},
            {"section_id": "s2", "section_title": "2.2 STRESS", "detected_headings": [], "key_terms": [], "formulas_detected": [], "tables_figures_detected": [], "why_this_section_matters": "Next"},
        ])], global_reading_advice="", recommended_learning_paths=[])
    pages = [
        {"page_number": 10, "printed_page_label": "2-1", "text": "2.0 SOILS\n2.1 BASIC RELATIONSHIPS", "detected_headings": ["2.0 SOILS", "2.1 BASIC RELATIONSHIPS"]},
        {"page_number": 11, "printed_page_label": "2-2", "text": "body", "detected_headings": []},
        {"page_number": 12, "printed_page_label": "2-3", "text": "2.2 STRESS", "detected_headings": ["2.2 STRESS"]},
        {"page_number": 13, "printed_page_label": "2-4", "text": "body", "detected_headings": []},
    ]
    resolved = resolve_structure(result, pages)
    assert resolved.chapters[0].page_end == 13
    assert resolved.chapters[0].sections[0].page_end == 11
    assert resolved.chapters[0].sections[0].printed_page_start == "2-1"


def test_formula_table_and_figure_detection() -> None:
    formulas, tables, figures = _detected_items("Eq. (2) sigma = P / A\nTable 2-1 Soil properties\nFigure 2-3 Stress bulb", 35, "2-1")
    assert formulas and formulas[0]["item_type"] == "formula"
    assert tables and tables[0]["page_number"] == 35
    assert figures and figures[0]["printed_page_label"] == "2-1"


def test_fhwa_named_headings_resolve_to_body_pages_and_printed_labels() -> None:
    pages = [
        {"page_number": 13, "printed_page_label": None, "text": "TABLE OF CONTENTS\n2.0 STRESS AND STRAIN IN SOILS ..... 2-1\n2.1 BASIC WEIGHT-VOLUME RELATIONSHIPS ..... 2-3", "detected_headings": []},
        {"page_number": 57, "printed_page_label": "2-1", "text": "CHAPTER 2.0\nSTRESS AND STRAIN IN SOILS", "detected_headings": ["STRESS AND STRAIN IN SOILS"]},
        {"page_number": 59, "printed_page_label": "2-3", "text": "2.1 BASIC WEIGHT-VOLUME RELATIONSHIPS\ne = Vv / Vs", "detected_headings": ["2.1 BASIC WEIGHT-VOLUME RELATIONSHIPS"]},
    ]
    stress = resolve_heading("STRESS AND STRAIN IN SOILS", pages)
    relationships = resolve_heading("BASIC WEIGHT-VOLUME RELATIONSHIPS", pages)
    assert stress[0] == 57
    assert relationships[0] == 59
    assert pages[1]["printed_page_label"] == "2-1"


def test_definition_index_has_clickable_page_targets_and_formula_context() -> None:
    pages = [{
        "page_number": 5, "printed_page_label": "2-3",
        "text": "Void ratio is defined as the ratio of void volume to solid volume. where e = void ratio",
        "detected_formulas": [{"item_id": "formula-5-e", "title_or_text": "e = Vv / Vs", "label": "Equation 2-2", "confidence": "high"}],
    }]
    result = extract_definition_index("Soils", "Weight-volume relationships", pages)
    validated = DefinitionIndexResponse.model_validate(result.model_dump())
    assert validated.definitions[0].page_defined == 5
    assert validated.definitions[0].quote_or_snippet
    assert validated.formulas[0].page_number == 5
    assert validated.formulas[0].printed_page_label == "2-3"


def test_reference_suggestions_are_labeled_as_cited_document_references() -> None:
    pages = [
        {"page_number": 4, "text": "The void ratio relationship is discussed by Smith (Smith, 2005).", "detected_headings": []},
        {"page_number": 20, "printed_page_label": "R-1", "text": "REFERENCES\nSmith, J. Soil Mechanics Handbook. 2005.", "detected_headings": ["REFERENCES"]},
    ]
    result = cited_references_for_term("void ratio", pages)
    assert result
    assert result[0].guidance_type == "cited_reference"
    assert result[0].page_number == 20


def test_scoped_pages_preserve_the_complete_selected_range() -> None:
    pages = [{"page_number": number, "text": str(number)} for number in range(1, 15)]
    selected = ai._scoped_pages(pages, 4, 11)
    assert [page["page_number"] for page in selected] == list(range(4, 12))


def test_guided_reading_large_range_returns_friendly_limit(monkeypatch) -> None:
    pages = [{"page_number": number, "text": f"Page {number}"} for number in range(1, 42)]
    monkeypatch.setattr(ai, "_pages_or_error", lambda *args: ({"title": "Manual"}, pages))
    monkeypatch.setattr(ai, "enforce_daily_limit", lambda *args, **kwargs: None)
    payload = GuidedReadingRequest(document_id="00000000-0000-0000-0000-000000000001", scope_type="section", page_start=1, page_end=41)
    with pytest.raises(HTTPException) as raised:
        ai.create_guided_reading(payload, "user-id", "session-123")
    assert raised.value.status_code == 413
    assert "40 pages or fewer" in raised.value.detail


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
