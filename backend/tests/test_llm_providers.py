from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models import PodcastCue, PodcastResponse, ReadingRouteResponse, TTSRequest
from app.routes import ai
from app.services import openai_service


def _route() -> ReadingRouteResponse:
    return ReadingRouteResponse(
        document_title="Test paper",
        overall_goal="Understand the argument",
        recommended_reading_order=[],
        skip_or_lightly_skim=[],
        key_tables_figures=[],
        citation_roles=[],
    )


def test_gemini_uses_chat_completions_for_structured_and_plain_text(monkeypatch) -> None:
    settings = SimpleNamespace(
        llm_provider="gemini",
        gemini_api_key="gemini-test-key",
        gemini_model="gemini-2.5-flash",
        openai_api_key="",
        openai_model="gpt-4o-mini",
    )
    route = _route()
    calls: list[str] = []

    class FakeCompletions:
        def parse(self, *, model, messages, response_format):
            calls.append("parse")
            assert model == settings.gemini_model
            assert response_format is ReadingRouteResponse
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=route, content=None))])

        def create(self, *, model, messages):
            calls.append("create")
            assert model == settings.gemini_model
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="Grounded answer [p. 1]"))])

    completions = FakeCompletions()
    client = SimpleNamespace(
        beta=SimpleNamespace(chat=SimpleNamespace(completions=completions)),
        chat=SimpleNamespace(completions=completions),
    )
    monkeypatch.setattr(openai_service, "get_settings", lambda: settings)
    monkeypatch.setattr(openai_service, "_llm_client", lambda: client)

    result = openai_service.reading_route("Test paper", [{"page_number": 1, "text": "Evidence"}])
    answer = openai_service.answer_question("What is the evidence?", [{"page_number": 1, "text": "Evidence"}])

    assert result == route
    assert answer == "Grounded answer [p. 1]"
    assert calls == ["parse", "create"]


def test_openai_provider_keeps_responses_api(monkeypatch) -> None:
    settings = SimpleNamespace(
        llm_provider="openai",
        gemini_api_key="",
        gemini_model="gemini-2.5-flash",
        openai_api_key="openai-test-key",
        openai_model="gpt-4o-mini",
    )
    route = _route()
    calls: list[str] = []

    class FakeResponses:
        def parse(self, *, model, input, text_format):
            calls.append("parse")
            return SimpleNamespace(output_parsed=route)

        def create(self, *, model, input):
            calls.append("create")
            return SimpleNamespace(output_text="OpenAI answer [p. 1]")

    monkeypatch.setattr(openai_service, "get_settings", lambda: settings)
    monkeypatch.setattr(openai_service, "_llm_client", lambda: SimpleNamespace(responses=FakeResponses()))

    result = openai_service.reading_route("Test paper", [{"page_number": 1, "text": "Evidence"}])
    answer = openai_service.answer_question("What is the evidence?", [{"page_number": 1, "text": "Evidence"}])

    assert result == route
    assert answer == "OpenAI answer [p. 1]"
    assert calls == ["parse", "create"]


def test_gemini_provider_rejects_tts(monkeypatch) -> None:
    settings = SimpleNamespace(llm_provider="gemini")
    monkeypatch.setattr(openai_service, "get_settings", lambda: settings)

    with pytest.raises(openai_service.ProviderCapabilityError, match="not supported"):
        openai_service.synthesize_speech("Hello")


def test_gemini_client_uses_openai_compatible_base_url(monkeypatch) -> None:
    settings = SimpleNamespace(
        llm_provider="gemini",
        gemini_api_key="gemini-test-key",
        gemini_model="gemini-2.5-flash",
    )
    monkeypatch.setattr(openai_service, "get_settings", lambda: settings)

    client = openai_service._llm_client()

    assert str(client.base_url) == openai_service.GEMINI_BASE_URL


def test_gemini_tts_route_returns_501(monkeypatch) -> None:
    monkeypatch.setattr(ai, "owned_document", lambda document_id, user_id: {})
    monkeypatch.setattr(
        openai_service,
        "synthesize_speech",
        lambda script: (_ for _ in ()).throw(openai_service.ProviderCapabilityError("Gemini TTS unavailable")),
    )

    with pytest.raises(HTTPException) as raised:
        ai.text_to_speech(
            TTSRequest(document_id="00000000-0000-0000-0000-000000000001", script="Hello"),
            user_id="user-id",
        )

    assert raised.value.status_code == 501
    assert raised.value.detail == "Gemini TTS unavailable"


def test_podcast_cues_are_grounded_against_extracted_pages(monkeypatch) -> None:
    generated = PodcastResponse(
        episode_title="Guided test",
        duration_minutes=8,
        script="A short walkthrough.",
        page_directions=[],
        pause_points=[],
        chapter_7_takeaways=[],
        cues=[
            PodcastCue(
                cue_id="key-result",
                page_number=1,
                quote_to_highlight="The measured result was 42 percent.",
                narration_text="Notice the measured result.",
                action="highlight",
                estimated_seconds=8,
                importance="high",
            ),
            PodcastCue(
                cue_id="key-result",
                page_number=1,
                quote_to_highlight="Invented quote",
                narration_text="Inspect a supposed figure.",
                action="inspect_figure",
                estimated_seconds=7,
                importance="medium",
            ),
            PodcastCue(
                cue_id="missing-page",
                page_number=99,
                quote_to_highlight="Missing text",
                narration_text="This page does not exist.",
                action="scroll",
                estimated_seconds=6,
                importance="low",
            ),
        ],
    )
    monkeypatch.setattr(openai_service, "_structured", lambda system, prompt, model_type: generated)

    result = openai_service.podcast_script(
        "Test paper",
        [{"page_number": 1, "text": "The measured result was 42 percent.", "detected_references": []}],
        8,
    )

    assert result.cues[0].action == "highlight"
    assert result.cues[0].quote_to_highlight == "The measured result was 42 percent."
    assert result.cues[1].cue_id == "key-result-2"
    assert result.cues[1].quote_to_highlight is None
    assert result.cues[1].action == "scroll"
    assert result.cues[2].page_number is None
    assert result.cues[2].action == "pause"
