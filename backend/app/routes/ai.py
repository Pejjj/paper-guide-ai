import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.config import get_settings
from app.models import (
    AskRequest,
    AskResponse,
    DocumentRequest,
    PodcastRequest,
    PodcastResponse,
    ReadingRouteResponse,
    TTSRequest,
    TTSResponse,
)
from app.services import openai_service
from app.services.supabase_service import document_pages, get_supabase, owned_document, require_user_id

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)


def _openai_unavailable(exc: Exception) -> HTTPException:
    safe_message = openai_service.safe_error_message(exc)
    logger.exception("OpenAI request failed (%s): %s", type(exc).__name__, safe_message)
    detail = safe_message if isinstance(exc, RuntimeError) else "OpenAI request failed. Please try again shortly."
    return HTTPException(status_code=503, detail=detail)


def _pages_or_error(document_id: str, user_id: str) -> tuple[dict, list[dict]]:
    document = owned_document(document_id, user_id)
    pages = document_pages(document_id, user_id)
    if not pages or not any((page.get("text") or "").strip() for page in pages):
        raise HTTPException(status_code=422, detail="No extractable document text is available. The PDF may be scanned or image-only.")
    return document, pages


@router.post("/reading-route", response_model=ReadingRouteResponse)
def create_reading_route(payload: DocumentRequest, user_id: str = Depends(require_user_id)) -> ReadingRouteResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    try:
        result = openai_service.reading_route(document["title"], pages)
    except Exception as exc:
        raise _openai_unavailable(exc) from exc
    get_supabase().table("reading_routes").insert({"document_id": str(payload.document_id), "user_id": user_id, "route": result.model_dump(mode="json")}).execute()
    return result


@router.post("/podcast-script", response_model=PodcastResponse)
def create_podcast(payload: PodcastRequest, user_id: str = Depends(require_user_id)) -> PodcastResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    try:
        result = openai_service.podcast_script(document["title"], pages, payload.duration_minutes)
    except Exception as exc:
        raise _openai_unavailable(exc) from exc
    get_supabase().table("podcast_scripts").insert({"document_id": str(payload.document_id), "user_id": user_id, "episode_title": result.episode_title, "duration_minutes": result.duration_minutes, "script": result.script, "payload": result.model_dump(mode="json")}).execute()
    return result


@router.post("/ask", response_model=AskResponse)
def ask_document(payload: AskRequest, user_id: str = Depends(require_user_id)) -> AskResponse:
    _, pages = _pages_or_error(str(payload.document_id), user_id)
    try:
        return AskResponse(answer=openai_service.answer_question(payload.question, pages))
    except Exception as exc:
        raise _openai_unavailable(exc) from exc


@router.post("/text-to-speech", response_model=TTSResponse)
def text_to_speech(payload: TTSRequest, user_id: str = Depends(require_user_id)) -> TTSResponse:
    owned_document(str(payload.document_id), user_id)
    try:
        audio = openai_service.synthesize_speech(payload.script)
    except Exception as exc:
        raise _openai_unavailable(exc) from exc
    generation_id = str(uuid4())
    path = f"{user_id}/{payload.document_id}/audio/{generation_id}.mp3"
    bucket = get_settings().supabase_audio_bucket
    client = get_supabase()
    client.storage.from_(bucket).upload(path, audio, {"content-type": "audio/mpeg", "upsert": "false"})
    client.table("audio_generations").insert({"id": generation_id, "document_id": str(payload.document_id), "user_id": user_id, "storage_path": path, "voice": get_settings().openai_tts_voice, "model": get_settings().openai_tts_model}).execute()
    signed = client.storage.from_(bucket).create_signed_url(path, 3600)
    return TTSResponse(signed_url=signed.get("signedURL") or signed.get("signedUrl"))
