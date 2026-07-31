from functools import lru_cache
from typing import Any

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
    response = get_supabase().table("documents").select("*").eq("id", document_id).eq("user_id", user_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Document not found.")
    return response.data[0]


def document_pages(document_id: str, user_id: str) -> list[dict[str, Any]]:
    owned_document(document_id, user_id)
    response = get_supabase().table("document_pages").select("page_number,text,detected_headings,detected_references").eq("document_id", document_id).order("page_number").execute()
    return response.data or []

