from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.routes import debug
from app.services import openai_service
from main import app

client = TestClient(app)


def test_debug_openai_is_hidden_when_disabled(monkeypatch) -> None:
    monkeypatch.setattr(
        debug,
        "get_settings",
        lambda: SimpleNamespace(debug_token="", openai_api_key="", openai_model="gpt-4o-mini"),
    )
    assert client.get("/debug/openai?token=anything").status_code == 404


def test_debug_openai_rejects_wrong_token(monkeypatch) -> None:
    monkeypatch.setattr(
        debug,
        "get_settings",
        lambda: SimpleNamespace(debug_token="correct-token", openai_api_key="", openai_model="gpt-4o-mini"),
    )
    assert client.get("/debug/openai?token=wrong-token").status_code == 403


def test_debug_openai_runs_tiny_test_without_exposing_key(monkeypatch) -> None:
    settings = SimpleNamespace(
        debug_token="correct-token",
        openai_api_key="sk-test-secret-value",
        openai_model="gpt-4o-mini",
    )

    class FakeResponses:
        def create(self, *, model: str, input: str) -> SimpleNamespace:
            assert model == settings.openai_model
            assert input == "Reply with exactly: ok"
            return SimpleNamespace(output_text="ok")

    class FakeOpenAI:
        def __init__(self, *, api_key: str) -> None:
            assert api_key == settings.openai_api_key
            self.responses = FakeResponses()

    monkeypatch.setattr(debug, "get_settings", lambda: settings)
    monkeypatch.setattr(debug, "OpenAI", FakeOpenAI)
    response = client.get("/debug/openai?token=correct-token")
    body = response.json()

    assert response.status_code == 200
    assert body["openai_api_key_set"] is True
    assert body["responses_available"] is True
    assert body["test_result"] == "success"
    assert body["output_text"] == "ok"
    assert settings.openai_api_key not in response.text


def test_debug_openai_redacts_key_from_safe_error(monkeypatch) -> None:
    settings = SimpleNamespace(
        debug_token="correct-token",
        openai_api_key="sk-test-secret-value",
        openai_model="gpt-4o-mini",
    )

    class FailingResponses:
        def create(self, *, model: str, input: str) -> None:
            raise ValueError(f"upstream rejected {settings.openai_api_key}")

    class FailingOpenAI:
        def __init__(self, *, api_key: str) -> None:
            self.responses = FailingResponses()

    monkeypatch.setattr(debug, "get_settings", lambda: settings)
    monkeypatch.setattr(debug, "OpenAI", FailingOpenAI)
    monkeypatch.setattr(openai_service, "get_settings", lambda: settings)
    response = client.get("/debug/openai?token=correct-token")

    assert response.status_code == 200
    assert response.json()["test_result"] == "failure"
    assert response.json()["safe_error_type"] == "ValueError"
    assert settings.openai_api_key not in response.text
    assert "[REDACTED]" in response.json()["safe_error_message"]


def test_debug_llm_reports_selected_provider_without_exposing_key(monkeypatch) -> None:
    settings = SimpleNamespace(
        debug_token="correct-token",
        llm_provider="gemini",
        gemini_api_key="gemini-test-key",
        gemini_model="gemini-2.5-flash",
        openai_api_key="",
        openai_model="gpt-4o-mini",
    )
    monkeypatch.setattr(debug, "get_settings", lambda: settings)
    monkeypatch.setattr(openai_service, "provider_sdk_available", lambda selected: True)
    monkeypatch.setattr(openai_service, "test_llm_provider", lambda: "ok")

    response = client.get("/debug/llm?token=correct-token")
    body = response.json()

    assert response.status_code == 200
    assert body["provider"] == "gemini"
    assert body["model"] == "gemini-2.5-flash"
    assert body["provider_api_key_set"] is True
    assert body["provider_available"] is True
    assert body["test_result"] == "success"
    assert body["output_text"] == "ok"
    assert settings.gemini_api_key not in response.text
