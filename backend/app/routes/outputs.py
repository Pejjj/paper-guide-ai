from fastapi import APIRouter, Depends, HTTPException

from app.services.supabase_service import get_supabase, owned_document, require_user_id

router = APIRouter(prefix="/ai-outputs", tags=["ai-outputs"])


@router.get("/{document_id}")
def list_outputs(document_id: str, user_id: str = Depends(require_user_id)) -> dict:
    owned_document(document_id, user_id)
    outputs = get_supabase().table("ai_outputs").select("*").eq("document_id", document_id).eq("user_id", user_id).order("updated_at", desc=True).execute().data or []
    output_ids = [row["id"] for row in outputs]
    versions = []
    if output_ids:
        versions = get_supabase().table("ai_output_versions").select("*").in_("ai_output_id", output_ids).order("created_at", desc=True).execute().data or []
    return {"outputs": outputs, "versions": versions}


@router.post("/{output_id}/revert/{version_number}")
def revert_output(output_id: str, version_number: int, user_id: str = Depends(require_user_id)) -> dict:
    output = get_supabase().table("ai_outputs").select("*").eq("id", output_id).eq("user_id", user_id).limit(1).execute().data
    if not output:
        raise HTTPException(status_code=404, detail="Saved AI response not found.")
    version = get_supabase().table("ai_output_versions").select("*").eq("ai_output_id", output_id).eq("version_number", version_number).limit(1).execute().data
    if not version:
        raise HTTPException(status_code=404, detail="Version not found.")
    get_supabase().table("ai_outputs").update({"payload": version[0]["payload"]}).eq("id", output_id).execute()
    return {"output_id": output_id, "version_number": version_number, "payload": version[0]["payload"]}
