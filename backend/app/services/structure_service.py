import re
from difflib import SequenceMatcher
from typing import Any

from app.models import ChapterItem, DocumentStructureResponse, SectionItem

DOT_LEADER = re.compile(r"\.{2,}\s*(\d{1,2}-\d{1,3}|\d+)\s*$")
NUMBER_PREFIX = re.compile(r"^\s*(?:chapter\s+)?(?:\d+(?:\.\d+)*|[ivxlcdm]+)[.)-]?\s*", re.IGNORECASE)


def normalize_heading(value: str, strip_number: bool = False) -> str:
    value = DOT_LEADER.sub("", value)
    if strip_number:
        value = NUMBER_PREFIX.sub("", value)
    return " ".join(re.sub(r"[^a-z0-9]+", " ", value.casefold()).split())


def is_toc_page(page: dict[str, Any]) -> bool:
    text = page.get("text") or ""
    lines = text.splitlines()
    dot_leaders = sum(bool(DOT_LEADER.search(line)) for line in lines)
    return "table of contents" in text.casefold() or dot_leaders >= 4


def _candidate_lines(page: dict[str, Any]) -> list[str]:
    headings = list(page.get("detected_headings") or [])
    leading = [" ".join(line.split()) for line in (page.get("text") or "").splitlines()[:35] if 2 < len(line.strip()) < 150]
    return list(dict.fromkeys([*headings, *leading]))


def resolve_heading(title: str, pages: list[dict[str, Any]], outline: list[dict[str, Any]] | None = None) -> tuple[int | None, str, str, str | None]:
    targets = {normalize_heading(title), normalize_heading(title, True)} - {""}
    for entry in outline or []:
        names = {normalize_heading(str(entry.get("title", ""))), normalize_heading(str(entry.get("title", "")), True)}
        page = int(entry.get("page_number") or 0)
        if targets & names and any(int(p["page_number"]) == page for p in pages):
            return page, "pdf_outline", "high", None
    best: tuple[float, int] | None = None
    toc_only = False
    for page in pages:
        toc = is_toc_page(page)
        for line in _candidate_lines(page):
            names = {normalize_heading(line), normalize_heading(line, True)} - {""}
            score = max((SequenceMatcher(None, target, name).ratio() for target in targets for name in names), default=0)
            exact = bool(targets & names)
            if exact or score >= 0.88:
                if toc:
                    toc_only = True
                    continue
                candidate = (1.0 if exact else score, int(page["page_number"]))
                if best is None or candidate[0] > best[0] or candidate[0] == best[0] and candidate[1] < best[1]:
                    best = candidate
    if best:
        return best[1], "body_heading_match", "high" if best[0] >= 0.96 else "medium", None
    warning = "Only a table-of-contents entry was found; the body page is unresolved." if toc_only else "No reliable body heading or PDF outline destination was found."
    return None, "toc_unresolved" if toc_only else "ai_inferred", "low", warning


def _items_for_range(pages: list[dict[str, Any]], start: int | None, end: int | None) -> list[dict[str, Any]]:
    if start is None:
        return []
    end = end or start
    result: list[dict[str, Any]] = []
    for page in pages:
        if start <= int(page["page_number"]) <= end:
            for key in ("detected_formulas", "detected_tables", "detected_figures"):
                result.extend(page.get(key) or [])
    return result


def _printed(pages: list[dict[str, Any]], number: int | None) -> str | None:
    if number is None:
        return None
    page = next((p for p in pages if int(p["page_number"]) == number), None)
    return page.get("printed_page_label") if page else None


def resolve_structure(result: DocumentStructureResponse, pages: list[dict[str, Any]], outline: list[dict[str, Any]] | None = None) -> DocumentStructureResponse:
    max_page = max((int(page["page_number"]) for page in pages), default=0)
    for chapter in result.chapters:
        chapter.page_start, chapter.source, chapter.confidence, chapter.warning = resolve_heading(chapter.chapter_title, pages, outline)
        if chapter.page_start is None:
            chapter.page_end = None
        for section in chapter.sections:
            section.page_start, section.source, section.confidence, section.warning = resolve_heading(section.section_title, pages, outline)
            if section.page_start is None:
                section.page_end = None

    resolved_chapters = [chapter for chapter in result.chapters if chapter.page_start is not None]
    for index, chapter in enumerate(resolved_chapters):
        next_start = resolved_chapters[index + 1].page_start if index + 1 < len(resolved_chapters) else None
        chapter.page_end = max(chapter.page_start or 1, (next_start - 1) if next_start else max_page)
        resolved_sections = sorted((section for section in chapter.sections if section.page_start is not None and chapter.page_start <= section.page_start <= chapter.page_end), key=lambda section: section.page_start or 0)
        for section_index, section in enumerate(resolved_sections):
            sibling_start = resolved_sections[section_index + 1].page_start if section_index + 1 < len(resolved_sections) else None
            section.page_end = max(section.page_start or 1, (sibling_start - 1) if sibling_start else chapter.page_end)
    for chapter in result.chapters:
        chapter.printed_page_start = _printed(pages, chapter.page_start)
        chapter.printed_page_end = _printed(pages, chapter.page_end)
        chapter.detected_items = _items_for_range(pages, chapter.page_start, chapter.page_end)
        for section in chapter.sections:
            section.printed_page_start = _printed(pages, section.page_start)
            section.printed_page_end = _printed(pages, section.page_end)
            section.detected_items = _items_for_range(pages, section.page_start, section.page_end)
            section.formulas_detected = [item["title_or_text"] for item in section.detected_items if item.get("item_type") == "formula"]
            section.tables_figures_detected = [item["title_or_text"] for item in section.detected_items if item.get("item_type") in {"table", "figure"}]
    return result


def structure_from_outline(title: str, pages: list[dict[str, Any]], outline: list[dict[str, Any]]) -> DocumentStructureResponse | None:
    valid = [entry for entry in outline if int(entry.get("page_number") or 0) > 0 and str(entry.get("title") or "").strip()]
    if len(valid) < 2:
        return None
    base = min(int(entry.get("level") or 1) for entry in valid)
    chapters: list[ChapterItem] = []
    for index, entry in enumerate(valid):
        level = int(entry.get("level") or base)
        label = str(entry["title"]).strip()
        if level == base or not chapters:
            chapters.append(ChapterItem(chapter_id=f"outline-chapter-{index + 1}", chapter_title=label, page_start=None, page_end=None, source="pdf_outline", confidence="high", sections=[]))
        else:
            chapters[-1].sections.append(SectionItem(section_id=f"outline-section-{index + 1}", section_title=label, detected_headings=[label], key_terms=[], formulas_detected=[], tables_figures_detected=[], why_this_section_matters="A bookmarked section in the PDF outline."))
    result = DocumentStructureResponse(document_title=title, detected_document_type="manual", chapters=chapters, global_reading_advice="Use the resolved chapter and section ranges to choose a focused reading scope.", recommended_learning_paths=["Start with a chapter overview, then read its resolved sections in order."])
    return resolve_structure(result, pages, outline)
