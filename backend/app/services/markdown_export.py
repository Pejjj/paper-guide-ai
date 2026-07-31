from datetime import datetime
from typing import Any


def render_notes_markdown(document: dict[str, Any], notes: list[dict[str, Any]]) -> str:
    lines = [f"# Notes: {document['title']}", "", f"_Exported {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M %Z')}_", ""]
    if not notes:
        lines.append("No notes have been saved for this document.")
    for note in notes:
        page = f" — Page {note['page_number']}" if note.get("page_number") else ""
        created = str(note.get("created_at", ""))[:10]
        lines.extend([f"## Note{page}", "", note["content"], "", f"_Saved {created}_", ""])
    return "\n".join(lines)

