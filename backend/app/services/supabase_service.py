from functools import lru_cache
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import Header, HTTPException, status
from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("Supabase is not configured")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def require_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in is required.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        response = get_supabase().auth.get_user(token)
        user = response.user
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token.") from exc
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token.")
    return str(user.id)


def owned_document(document_id: str, user_id: str) -> dict[str, Any]:
    response = get_supabase().table("documents").select("*").eq("id", document_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Document not found.")
    document = response.data[0]
    if document.get("user_id") != user_id and not document.get("is_sample"):
        raise HTTPException(status_code=404, detail="Document not found.")
    return document


def document_pages(document_id: str, user_id: str) -> list[dict[str, Any]]:
    owned_document(document_id, user_id)
    response = get_supabase().table("document_pages").select("page_number,text,detected_headings,detected_references").eq("document_id", document_id).order("page_number").execute()
    return response.data or []


def track_event(event_name: str, path: str, anonymous_session_id: str, metadata: dict | None = None) -> None:
    safe_metadata: dict[str, Any] = {}
    for key, value in (metadata or {}).items():
        if key in {"document_text", "question", "answer", "email", "name", "api_key"}:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe_metadata[str(key)[:80]] = value if not isinstance(value, str) else value[:200]
    get_supabase().table("analytics_events").insert({
        "event_name": event_name,
        "path": path[:500],
        "anonymous_session_id": anonymous_session_id[:100],
        "metadata": safe_metadata,
    }).execute()


def enforce_daily_limit(event_name: str, anonymous_session_id: str, limit: int, label: str) -> None:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    response = (
        get_supabase().table("analytics_events").select("id", count="exact")
        .eq("event_name", event_name).eq("anonymous_session_id", anonymous_session_id).gte("created_at", start).execute()
    )
    count = response.count if response.count is not None else len(response.data or [])
    if count >= limit:
        raise HTTPException(status_code=429, detail=f"Today’s free-demo limit for {label} has been reached. Please try again tomorrow.")


def save_ai_output(
    document_id: str,
    user_id: str,
    output_type: str,
    payload: dict | str,
    scope_type: str = "document",
    scope_metadata: dict | None = None,
    anonymous_session_id: str | None = None,
) -> dict[str, Any]:
    output_id = str(uuid4())
    row = get_supabase().table("ai_outputs").insert({
        "id": output_id,
        "user_id": user_id,
        "anonymous_session_id": anonymous_session_id,
        "document_id": document_id,
        "output_type": output_type,
        "scope_type": scope_type,
        "scope_metadata": scope_metadata or {},
        "payload": payload,
    }).execute().data[0]
    get_supabase().table("ai_output_versions").insert({
        "ai_output_id": output_id,
        "version_number": 1,
        "instruction": None,
        "payload": payload,
    }).execute()
    return row


def add_ai_output_version(output_id: str, user_id: str, payload: dict | str, instruction: str) -> tuple[dict[str, Any], int]:
    output = get_supabase().table("ai_outputs").select("*").eq("id", output_id).eq("user_id", user_id).limit(1).execute()
    if not output.data:
        raise HTTPException(status_code=404, detail="Saved AI response not found.")
    versions = get_supabase().table("ai_output_versions").select("version_number").eq("ai_output_id", output_id).order("version_number", desc=True).limit(1).execute().data
    number = (versions[0]["version_number"] if versions else 0) + 1
    get_supabase().table("ai_output_versions").insert({
        "ai_output_id": output_id,
        "version_number": number,
        "instruction": instruction,
        "payload": payload,
    }).execute()
    get_supabase().table("ai_outputs").update({"payload": payload}).eq("id", output_id).execute()
    return output.data[0], number
