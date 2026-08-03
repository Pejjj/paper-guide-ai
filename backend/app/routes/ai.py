import logging
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException

from app.config import get_settings
from app.models import (
    AskRequest,
    AskResponse,
    ConceptReadthroughRequest,
    ConceptReadthroughResponse,
    ConceptGuideRequest,
    ConceptGuideResponse,
    DefinitionIndexRequest,
    DefinitionIndexResponse,
    DocumentStructureResponse,
    DocumentRequest,
    GuidedReadingRequest,
    MethodWalkthroughRequest,
    MethodWalkthroughResponse,
    PodcastRequest,
    PodcastResponse,
    ReadingRouteResponse,
    SectionIntroRequest,
    SectionIntroResponse,
    TTSRequest,
    TTSResponse,
    UpdateResponseRequest,
    UpdateResponseResult,
)
from app.services import openai_service
from app.services.supabase_service import (
    add_ai_output_version,
    document_pages,
    enforce_daily_limit,
    get_supabase,
    owned_document,
    require_user_id,
    save_ai_output,
    track_event,
)

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)


def _llm_unavailable(exc: Exception) -> HTTPException:
    safe_message = openai_service.safe_error_message(exc)
    logger.exception(
        "%s provider request failed (%s): %s",
        get_settings().llm_provider,
        type(exc).__name__,
        safe_message,
    )
    detail = safe_message if isinstance(exc, RuntimeError) else "LLM provider request failed. Please try again shortly."
    return HTTPException(status_code=503, detail=detail)


def _pages_or_error(document_id: str, user_id: str) -> tuple[dict, list[dict]]:
    document = owned_document(document_id, user_id)
    pages = document_pages(document_id, user_id)
    if not pages or not any((page.get("text") or "").strip() for page in pages):
        raise HTTPException(status_code=422, detail="No extractable document text is available. The PDF may be scanned or image-only.")
    return document, pages


def _scoped_pages(pages: list[dict], page_start: int | None, page_end: int | None) -> list[dict]:
    if page_start is None and page_end is None:
        return pages
    start = page_start or 1
    end = page_end or start
    if end < start:
        start, end = end, start
    selected = [page for page in pages if start <= int(page["page_number"]) <= end]
    if not selected:
        raise HTTPException(status_code=422, detail="The selected page range is not available in this document.")
    return selected


@router.post("/reading-route", response_model=ReadingRouteResponse)
def create_reading_route(payload: DocumentRequest, user_id: str = Depends(require_user_id)) -> ReadingRouteResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    try:
        result = openai_service.reading_route(document["title"], pages)
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    get_supabase().table("reading_routes").insert({"document_id": str(payload.document_id), "user_id": user_id, "route": result.model_dump(mode="json")}).execute()
    save_ai_output(str(payload.document_id), user_id, "reading_route", result.model_dump(mode="json"))
    return result


@router.post("/podcast-script", response_model=PodcastResponse)
def create_podcast(payload: PodcastRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> PodcastResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    settings = get_settings()
    enforce_daily_limit("guided_reading_generated", x_anonymous_session_id, settings.public_max_guided_readings_per_day, "guided readings")
    pages = _scoped_pages(pages, payload.page_start, payload.page_end)
    try:
        result = openai_service.podcast_script(document["title"], pages, payload.duration_minutes, payload.mode, payload.scope_type)
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    get_supabase().table("podcast_scripts").insert({"document_id": str(payload.document_id), "user_id": user_id, "episode_title": result.episode_title, "duration_minutes": result.duration_minutes, "script": result.script, "payload": result.model_dump(mode="json")}).execute()
    save_ai_output(str(payload.document_id), user_id, "guided_reading", result.model_dump(mode="json"), payload.scope_type, {"page_start": payload.page_start, "page_end": payload.page_end, "mode": payload.mode}, x_anonymous_session_id)
    track_event("guided_reading_generated", "/ai/podcast-script", x_anonymous_session_id, {"scope_type": payload.scope_type, "mode": payload.mode})
    return result


@router.post("/guided-reading", response_model=PodcastResponse)
def create_guided_reading(payload: GuidedReadingRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> PodcastResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    settings = get_settings()
    enforce_daily_limit("guided_reading_generated", x_anonymous_session_id, settings.public_max_guided_readings_per_day, "guided readings")
    if payload.scope_type != "document" and payload.page_start is None:
        raise HTTPException(status_code=422, detail="A resolved page_start is required for scoped guided reading.")
    selected = _scoped_pages(pages, payload.page_start, payload.page_end)
    if len(selected) > settings.guided_reading_max_scope_pages:
        raise HTTPException(status_code=413, detail=f"This range has {len(selected)} pages. Choose a section of {settings.guided_reading_max_scope_pages} pages or fewer, or generate a chapter overview first.")
    mode = {
        "normal": "normal", "simple_english": "simple", "technical": "technical",
        "formulas_only": "formulas", "exam_study": "exam", "method_reproduction": "technical",
    }[payload.learning_mode]
    try:
        result = openai_service.podcast_script(document["title"], selected, payload.duration_minutes, mode, payload.scope_type, payload.focus_text)
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    data = result.model_dump(mode="json")
    get_supabase().table("podcast_scripts").insert({"document_id": str(payload.document_id), "user_id": user_id, "episode_title": result.episode_title, "duration_minutes": result.duration_minutes, "script": result.script, "payload": data}).execute()
    save_ai_output(str(payload.document_id), user_id, "guided_reading", data, payload.scope_type, {"page_start": payload.page_start, "page_end": payload.page_end, "learning_mode": payload.learning_mode, "section_id": payload.section_id, "chapter_id": payload.chapter_id}, x_anonymous_session_id)
    track_event("guided_reading_generated", "/ai/guided-reading", x_anonymous_session_id, {"scope_type": payload.scope_type, "learning_mode": payload.learning_mode})
    return result


@router.post("/ask", response_model=AskResponse)
def ask_document(payload: AskRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> AskResponse:
    _, pages = _pages_or_error(str(payload.document_id), user_id)
    enforce_daily_limit("ask_document_used", x_anonymous_session_id, get_settings().public_max_questions_per_day, "document questions")
    selected = _scoped_pages(pages, payload.page_start, payload.page_end)
    if payload.scope_type not in {"document", "page"}:
        selected_numbers = {int(page["page_number"]) for page in selected}
        related = [page for page in openai_service.related_pages(payload.question, pages, 8) if int(page["page_number"]) not in selected_numbers]
        selected = [*selected, *related]
    try:
        result = AskResponse(answer=openai_service.answer_question(payload.question, selected))
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    save_ai_output(str(payload.document_id), user_id, "ask_answer", {"question": payload.question, "answer": result.answer}, payload.scope_type, {"page_start": payload.page_start, "page_end": payload.page_end}, x_anonymous_session_id)
    track_event("ask_document_used", "/ai/ask", x_anonymous_session_id, {"scope_type": payload.scope_type})
    return result


@router.post("/chapter-map", response_model=DocumentStructureResponse)
def create_chapter_map(payload: DocumentRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> DocumentStructureResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    try:
        result = openai_service.chapter_map(document["title"], pages, (document.get("metadata") or {}).get("outline") or [])
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    save_ai_output(str(payload.document_id), user_id, "chapter_map", result.model_dump(mode="json"), anonymous_session_id=x_anonymous_session_id)
    track_event("chapter_map_generated", "/ai/chapter-map", x_anonymous_session_id, {"chapter_count": len(result.chapters)})
    return result


@router.post("/section-intro", response_model=SectionIntroResponse)
def create_section_intro(payload: SectionIntroRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> SectionIntroResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    enforce_daily_limit("section_intro_generated", x_anonymous_session_id, get_settings().public_max_section_intros_per_day, "section introductions")
    selected = _scoped_pages(pages, payload.page_start, payload.page_end)
    try:
        result = openai_service.section_intro(document["title"], selected, payload.section_title or payload.section_id or "Selected section", payload.user_level, payload.focus)
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    save_ai_output(str(payload.document_id), user_id, "section_intro", result.model_dump(mode="json"), "section", {"section_id": payload.section_id, "page_start": payload.page_start, "page_end": payload.page_end}, x_anonymous_session_id)
    track_event("section_intro_generated", "/ai/section-intro", x_anonymous_session_id, {"focus": payload.focus, "user_level": payload.user_level})
    return result


@router.post("/method-walkthrough", response_model=MethodWalkthroughResponse)
def create_method_walkthrough(payload: MethodWalkthroughRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> MethodWalkthroughResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    selected = _scoped_pages(pages, payload.page_start, payload.page_end)
    try:
        result = openai_service.method_walkthrough(document["title"], selected, payload.user_goal)
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    save_ai_output(str(payload.document_id), user_id, "method_walkthrough", result.model_dump(mode="json"), "method", {"page_start": payload.page_start, "page_end": payload.page_end, "user_goal": payload.user_goal}, x_anonymous_session_id)
    return result


@router.post("/concept-guide", response_model=ConceptGuideResponse)
def create_concept_guide(payload: ConceptGuideRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> ConceptGuideResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    selected = _scoped_pages(pages, payload.page_start, payload.page_end)
    try:
        result = openai_service.concept_guide(document["title"], selected, payload.concept_or_question)
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    save_ai_output(str(payload.document_id), user_id, "concept_guide", result.model_dump(mode="json"), "concept", {"concept": payload.concept_or_question}, x_anonymous_session_id)
    return result


@router.post("/definition-index", response_model=DefinitionIndexResponse)
def create_definition_index(payload: DefinitionIndexRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> DefinitionIndexResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    selected = _scoped_pages(pages, payload.page_start, payload.page_end)
    try:
        result = openai_service.definition_index(document["title"], payload.scope_title or payload.scope_type.replace("_", " ").title(), selected, payload.mode)
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    data = result.model_dump(mode="json")
    save_ai_output(str(payload.document_id), user_id, "definition_index", data, payload.scope_type, {"page_start": payload.page_start, "page_end": payload.page_end, "scope_title": payload.scope_title, "mode": payload.mode}, x_anonymous_session_id)
    return result


@router.post("/concept-readthrough", response_model=ConceptReadthroughResponse)
def create_concept_readthrough(payload: ConceptReadthroughRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> ConceptReadthroughResponse:
    document, pages = _pages_or_error(str(payload.document_id), user_id)
    selected = _scoped_pages(pages, payload.page_start, payload.page_end)
    if len(selected) > get_settings().guided_reading_max_scope_pages:
        raise HTTPException(status_code=413, detail="This concept scope is too large. Select a section or a range of 40 pages or fewer.")
    selected_numbers = {int(page["page_number"]) for page in selected}
    related = [page for page in openai_service.related_pages(payload.term, pages, 10) if int(page["page_number"]) not in selected_numbers]
    reference_pages = [page for page in pages if "references" in (page.get("text") or "").casefold() or any("reference" in str(value).casefold() for value in page.get("detected_headings") or [])]
    for page in [*related, *reference_pages]:
        number = int(page["page_number"])
        if number not in selected_numbers and len(selected) < get_settings().guided_reading_max_scope_pages:
            selected.append(page)
            selected_numbers.add(number)
    selected.sort(key=lambda page: int(page["page_number"]))
    try:
        result = openai_service.concept_readthrough(document["title"], selected, payload.term, payload.learning_mode)
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    data = result.model_dump(mode="json")
    save_ai_output(str(payload.document_id), user_id, "concept_readthrough", data, "concept", {"definition_id": payload.definition_id, "term": payload.term, "page_start": payload.page_start, "page_end": payload.page_end}, x_anonymous_session_id)
    return result


@router.post("/update-response", response_model=UpdateResponseResult)
def update_response(payload: UpdateResponseRequest, user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> UpdateResponseResult:
    _, pages = _pages_or_error(str(payload.document_id), user_id)
    page_start = payload.current_context.get("page_start")
    page_end = payload.current_context.get("page_end")
    selected = _scoped_pages(pages, page_start, page_end)
    try:
        updated, explanation = openai_service.update_structured_response(payload.original_response_type, payload.original_response_json, payload.user_instruction, payload.current_context, selected)
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    if payload.response_id:
        output_id = str(payload.response_id)
    else:
        output_id = save_ai_output(str(payload.document_id), user_id, payload.original_response_type, payload.original_response_json, payload.current_context.get("scope_type", "document"), payload.current_context, x_anonymous_session_id)["id"]
    _, version = add_ai_output_version(output_id, user_id, updated, payload.user_instruction)
    track_event("response_updated_by_chat", "/ai/update-response", x_anonymous_session_id, {"response_type": payload.original_response_type})
    return UpdateResponseResult(response_id=output_id, version_number=version, updated_response=updated, explanation_of_changes=explanation, user_instruction=payload.user_instruction)


@router.post("/text-to-speech", response_model=TTSResponse)
def text_to_speech(payload: TTSRequest, user_id: str = Depends(require_user_id)) -> TTSResponse:
    owned_document(str(payload.document_id), user_id)
    try:
        audio = openai_service.synthesize_speech(payload.script)
    except openai_service.ProviderCapabilityError as exc:
        safe_message = openai_service.safe_error_message(exc)
        logger.warning("LLM provider does not support TTS: %s", safe_message)
        raise HTTPException(status_code=501, detail=safe_message) from exc
    except Exception as exc:
        raise _llm_unavailable(exc) from exc
    generation_id = str(uuid4())
    path = f"{user_id}/{payload.document_id}/audio/{generation_id}.mp3"
    bucket = get_settings().supabase_audio_bucket
    client = get_supabase()
    client.storage.from_(bucket).upload(path, audio, {"content-type": "audio/mpeg", "upsert": "false"})
    client.table("audio_generations").insert({"id": generation_id, "document_id": str(payload.document_id), "user_id": user_id, "storage_path": path, "voice": get_settings().openai_tts_voice, "model": get_settings().openai_tts_model}).execute()
    signed = client.storage.from_(bucket).create_signed_url(path, 3600)
    return TTSResponse(signed_url=signed.get("signedURL") or signed.get("signedUrl"))
    MethodWalkthroughRequest,
    MethodWalkthroughResponse,
    SectionIntroRequest,
    SectionIntroResponse,
