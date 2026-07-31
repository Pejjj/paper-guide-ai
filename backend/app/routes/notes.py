from fastapi import APIRouter, Depends, Response

from app.models import NoteCreate, NoteOut
from app.services.markdown_export import render_notes_markdown
from app.services.supabase_service import get_supabase, owned_document, require_user_id

router = APIRouter(prefix="/notes", tags=["notes"])


@router.post("", response_model=NoteOut, status_code=201)
def save_note(payload: NoteCreate, user_id: str = Depends(require_user_id)) -> dict:
    owned_document(str(payload.document_id), user_id)
    result = get_supabase().table("notes").insert({"document_id": str(payload.document_id), "user_id": user_id, "content": payload.content, "page_number": payload.page_number}).execute()
    return result.data[0]


@router.get("/{document_id}", response_model=list[NoteOut])
def list_notes(document_id: str, user_id: str = Depends(require_user_id)) -> list[dict]:
    owned_document(document_id, user_id)
    result = get_supabase().table("notes").select("*").eq("document_id", document_id).eq("user_id", user_id).order("created_at", desc=True).execute()
    return result.data or []


@router.get("/{document_id}/export.md")
def export_notes(document_id: str, user_id: str = Depends(require_user_id)) -> Response:
    document = owned_document(document_id, user_id)
    result = get_supabase().table("notes").select("*").eq("document_id", document_id).eq("user_id", user_id).order("created_at").execute()
    markdown = render_notes_markdown(document, result.data or [])
    filename = "".join(char if char.isalnum() or char in "-_" else "-" for char in document["title"]).strip("-") or "notes"
    return Response(content=markdown, media_type="text/markdown", headers={"Content-Disposition": f'attachment; filename="{filename}-notes.md"'})

