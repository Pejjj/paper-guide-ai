from secrets import compare_digest

import openai
from fastapi import APIRouter, HTTPException, Query
from openai import OpenAI

from app.config import get_settings
from app.services.openai_service import safe_error_message

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/openai")
def debug_openai(token: str | None = Query(default=None)) -> dict[str, object]:
    settings = get_settings()
    if not settings.debug_token:
        raise HTTPException(status_code=404, detail="Not found.")
    if token is None or not compare_digest(token, settings.debug_token):
        raise HTTPException(status_code=403, detail="Invalid debug token.")

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
