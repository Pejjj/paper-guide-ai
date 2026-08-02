from pathlib import Path
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status

from app.config import get_settings
from app.models import DocumentOut, PageOut
from app.services.pdf_service import extract_pdf
from app.services.supabase_service import get_supabase, owned_document, require_user_id, track_event

router = APIRouter(prefix="/documents", tags=["documents"])
SAMPLE_TITLE = "Soils and Foundations Reference Manual, Volume I"
SAMPLE_SUBTITLE = "A classic FHWA/NHI geotechnical reference for soil mechanics, subsurface exploration, slope stability, and foundation design."
SAMPLE_ATTRIBUTION = "Federal Highway Administration / National Highway Institute, FHWA-NHI-06-088"


def _present_document(document: dict) -> dict:
    document["read_only"] = bool(document.get("is_sample"))
    if document.get("is_sample"):
        metadata = document.get("metadata") or {}
        document["subtitle"] = metadata.get("subtitle") or SAMPLE_SUBTITLE
        document["source_attribution"] = metadata.get("source_attribution") or SAMPLE_ATTRIBUTION
    return document


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(file: UploadFile = File(...), user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> dict:
    settings = get_settings()
    if file.content_type != "application/pdf" or Path(file.filename or "").suffix.lower() != ".pdf":
        raise HTTPException(status_code=415, detail="Only PDF uploads are accepted.")
    contents = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(contents) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"PDF exceeds the {settings.max_upload_mb} MB limit.")
    try:
        pages, metadata = extract_pdf(contents)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not pages:
        raise HTTPException(status_code=422, detail="The PDF has no pages.")
    if len(pages) > settings.public_max_pages:
        raise HTTPException(status_code=413, detail=f"This free demo accepts PDFs up to {settings.public_max_pages} pages.")

    client = get_supabase()
    document_id = str(uuid4())
    safe_name = "".join(char if char.isalnum() or char in "-_." else "_" for char in (file.filename or "document.pdf"))
    storage_path = f"{user_id}/{document_id}/{safe_name}"
    title = (metadata.get("title") or Path(file.filename or "Untitled document").stem).strip()
    try:
        client.storage.from_(settings.supabase_pdf_bucket).upload(
            storage_path,
            contents,
            {"content-type": "application/pdf", "upsert": "false"},
        )
        inserted = client.table("documents").insert({
            "id": document_id,
            "user_id": user_id,
            "title": title,
            "original_filename": file.filename or "document.pdf",
            "storage_path": storage_path,
            "page_count": len(pages),
            "status": "ready",
            "metadata": metadata,
        }).execute().data[0]
        rows = [{
            "document_id": document_id,
            "page_number": page.page_number,
            "text": page.text,
            "detected_headings": page.detected_headings,
            "detected_references": page.detected_references,
        } for page in pages]
        for start in range(0, len(rows), 100):
            client.table("document_pages").insert(rows[start:start + 100]).execute()
        track_event("pdf_uploaded", "/documents/upload", x_anonymous_session_id, {"page_count": len(pages)})
        inserted["read_only"] = False
        return inserted
    except Exception as exc:
        try:
            client.storage.from_(settings.supabase_pdf_bucket).remove([storage_path])
            client.table("documents").delete().eq("id", document_id).execute()
        except Exception:
            pass
        raise HTTPException(status_code=502, detail="PDF storage or indexing failed.") from exc


@router.get("", response_model=list[DocumentOut])
def list_documents(user_id: str = Depends(require_user_id)) -> list[dict]:
    client = get_supabase()
    owned = client.table("documents").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data or []
    sample = client.table("documents").select("*").eq("is_sample", True).eq("source_url", get_settings().sample_source_url).limit(1).execute().data or []
    return [_present_document(row) for row in [*sample, *owned]]


@router.get("/sample", response_model=DocumentOut)
def get_or_create_sample(user_id: str = Depends(require_user_id), x_anonymous_session_id: str = Header(default="unknown-session")) -> dict:
    settings = get_settings()
    client = get_supabase()
    existing = client.table("documents").select("*").eq("is_sample", True).eq("source_url", settings.sample_source_url).limit(1).execute().data
    if existing:
        document = existing[0]
    else:
        try:
            response = httpx.get(settings.sample_pdf_url, follow_redirects=True, timeout=60)
            response.raise_for_status()
            pages, metadata = extract_pdf(response.content)
            if not pages:
                raise ValueError("The sample PDF has no extractable pages.")
            document_id = str(uuid4())
            storage_path = f"samples/{document_id}/FHWA-NHI-06-088.pdf"
            client.storage.from_(settings.supabase_pdf_bucket).upload(storage_path, response.content, {"content-type": "application/pdf", "upsert": "false"})
            document = client.table("documents").insert({
                "id": document_id,
                "user_id": None,
                "title": SAMPLE_TITLE,
                "original_filename": "FHWA-NHI-06-088.pdf",
                "storage_path": storage_path,
                "page_count": len(pages),
                "status": "ready",
                "metadata": {
                    **metadata,
                    "source": "FHWA/NHI",
                    "source_url": settings.sample_source_url,
                    "subtitle": SAMPLE_SUBTITLE,
                    "source_attribution": SAMPLE_ATTRIBUTION,
                },
                "is_sample": True,
                "source_url": settings.sample_source_url,
            }).execute().data[0]
            rows = [{
                "document_id": document_id,
                "page_number": page.page_number,
                "text": page.text,
                "detected_headings": page.detected_headings,
                "detected_references": page.detected_references,
            } for page in pages]
            for start in range(0, len(rows), 100):
                client.table("document_pages").insert(rows[start:start + 100]).execute()
        except Exception as exc:
            raise HTTPException(status_code=503, detail="The public sample is being prepared. Please try again shortly.") from exc
    signed = client.storage.from_(settings.supabase_pdf_bucket).create_signed_url(document["storage_path"], 3600)
    document["signed_url"] = signed.get("signedURL") or signed.get("signedUrl")
    track_event("sample_document_opened", "/documents/sample", x_anonymous_session_id, {"source": "FHWA/NHI"})
    return _present_document(document)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: str, user_id: str = Depends(require_user_id)) -> dict:
    document = owned_document(document_id, user_id)
    result = get_supabase().storage.from_(get_settings().supabase_pdf_bucket).create_signed_url(document["storage_path"], 3600)
    document["signed_url"] = result.get("signedURL") or result.get("signedUrl")
    return _present_document(document)


@router.get("/{document_id}/pages/{page_number}", response_model=PageOut)
def get_page(document_id: str, page_number: int, user_id: str = Depends(require_user_id)) -> dict:
    owned_document(document_id, user_id)
    response = get_supabase().table("document_pages").select("*").eq("document_id", document_id).eq("page_number", page_number).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Page not found or text extraction failed.")
    return response.data[0]
