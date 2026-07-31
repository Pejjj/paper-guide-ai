from secrets import compare_digest

import openai
from fastapi import APIRouter, HTTPException, Query
from openai import OpenAI

from app.config import get_settings
from app.services import openai_service
from app.services.openai_service import safe_error_message

router = APIRouter(prefix="/debug", tags=["debug"])


def _authorize_debug(token: str | None) -> None:
    settings = get_settings()
    if not settings.debug_token:
        raise HTTPException(status_code=404, detail="Not found.")
    if token is None or not compare_digest(token, settings.debug_token):
        raise HTTPException(status_code=403, detail="Invalid debug token.")


@router.get("/openai")
def debug_openai(token: str | None = Query(default=None)) -> dict[str, object]:
    _authorize_debug(token)
    settings = get_settings()
    client = OpenAI(api_key=settings.openai_api_key or "not-configured")
    responses_available = hasattr(client, "responses") and hasattr(client.responses, "create")
    result: dict[str, object] = {
        "openai_api_key_set": bool(settings.openai_api_key),
        "openai_model": settings.openai_model,
        "openai_sdk_version": openai.__version__,
        "responses_available": responses_available,
        "test_result": "failure",
        "safe_error_type": None,
        "safe_error_message": None,
    }

    if not settings.openai_api_key:
        result["safe_error_type"] = "ConfigurationError"
        result["safe_error_message"] = "OPENAI_API_KEY is not set."
        return result
    if not responses_available:
        result["safe_error_type"] = "SDKCapabilityError"
        result["safe_error_message"] = "The installed OpenAI SDK does not expose responses.create."
        return result

    try:
        response = client.responses.create(
            model=settings.openai_model,
            input="Reply with exactly: ok",
        )
        result["test_result"] = "success"
        result["output_text"] = response.output_text
    except Exception as exc:
        result["safe_error_type"] = type(exc).__name__
        result["safe_error_message"] = safe_error_message(exc)

    return result


@router.get("/llm")
def debug_llm(token: str | None = Query(default=None)) -> dict[str, object]:
    _authorize_debug(token)
    settings = get_settings()
    api_key_set = bool(openai_service.selected_api_key(settings))
    provider_available = openai_service.provider_sdk_available(settings)
    result: dict[str, object] = {
        "provider": settings.llm_provider,
        "model": openai_service.selected_model(settings),
        "openai_sdk_version": openai.__version__,
        "provider_api_key_set": api_key_set,
        "provider_available": provider_available,
        "test_result": "failure",
        "safe_error_type": None,
        "safe_error_message": None,
    }

    if not api_key_set:
        variable = "GEMINI_API_KEY" if settings.llm_provider == "gemini" else "OPENAI_API_KEY"
        result["safe_error_type"] = "ConfigurationError"
        result["safe_error_message"] = f"{variable} is not set."
        return result
    if not provider_available:
        result["safe_error_type"] = "SDKCapabilityError"
        result["safe_error_message"] = "The installed SDK does not expose the selected provider API."
        return result

    try:
        result["output_text"] = openai_service.test_llm_provider()
        result["test_result"] = "success"
    except Exception as exc:
        result["safe_error_type"] = type(exc).__name__
        result["safe_error_message"] = openai_service.safe_error_message(exc)

    return result
