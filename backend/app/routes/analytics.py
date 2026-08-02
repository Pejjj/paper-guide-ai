from secrets import compare_digest

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import get_settings
from app.models import AnalyticsEventCreate
from app.services.supabase_service import get_supabase, require_user_id, track_event

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/events", status_code=201)
def create_event(payload: AnalyticsEventCreate, _user_id: str = Depends(require_user_id)) -> dict[str, bool]:
    track_event(payload.event_name, payload.path, payload.anonymous_session_id, payload.metadata)
    return {"accepted": True}


@router.get("/aggregate")
def aggregate(token: str | None = Query(default=None)) -> dict[str, int]:
    settings = get_settings()
    expected = settings.admin_token or settings.debug_token
    if not expected:
        raise HTTPException(status_code=404, detail="Not found.")
    if token is None or not compare_digest(token, expected):
        raise HTTPException(status_code=403, detail="Invalid admin token.")
    mapping = {
        "total_visits": "page_view",
        "sample_starts": "sample_document_opened",
        "uploads": "pdf_uploaded",
        "guided_readings_generated": "guided_reading_generated",
        "guided_readings_started": "guided_reading_started",
        "questions_asked": "ask_document_used",
        "section_intros_generated": "section_intro_generated",
    }
    result: dict[str, int] = {}
    client = get_supabase()
    for label, event in mapping.items():
        response = client.table("analytics_events").select("id", count="exact").eq("event_name", event).execute()
        result[label] = response.count if response.count is not None else len(response.data or [])
    return result
