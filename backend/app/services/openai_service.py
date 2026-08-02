import re
from collections import Counter
from typing import Any, TypeVar

from openai import OpenAI
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.models import (
    ConceptGuideResponse,
    DocumentStructureResponse,
    MethodWalkthroughResponse,
    PodcastCue,
    PodcastResponse,
    ReadingRouteResponse,
    SectionIntroResponse,
)

T = TypeVar("T", bound=BaseModel)
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
SECRET_PATTERN = re.compile(r"\b(?:(?:sk|sess)-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b")


class ProviderCapabilityError(RuntimeError):
    """Raised when the selected provider does not implement an app capability."""


def selected_model(settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    return settings.gemini_model if settings.llm_provider == "gemini" else settings.openai_model


def selected_api_key(settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    return settings.gemini_api_key if settings.llm_provider == "gemini" else settings.openai_api_key


def safe_error_message(exc: Exception) -> str:
    message = str(exc) or type(exc).__name__
    settings = get_settings()
    for secret in (getattr(settings, "openai_api_key", ""), getattr(settings, "gemini_api_key", "")):
        if secret:
            message = message.replace(secret, "[REDACTED]")
    return SECRET_PATTERN.sub("[REDACTED]", message)[:1_000]


def _openai_client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")
    return OpenAI(api_key=settings.openai_api_key)


def _llm_client() -> OpenAI:
    settings = get_settings()
    if settings.llm_provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")
        return OpenAI(api_key=settings.gemini_api_key, base_url=GEMINI_BASE_URL)
    return _openai_client()


def provider_sdk_available(settings: Settings | None = None) -> bool:
    settings = settings or get_settings()
    client = OpenAI(
        api_key=selected_api_key(settings) or "not-configured",
        base_url=GEMINI_BASE_URL if settings.llm_provider == "gemini" else None,
    )
    if settings.llm_provider == "gemini":
        return hasattr(client, "chat") and hasattr(client.chat.completions, "create")
    return hasattr(client, "responses") and hasattr(client.responses, "create")


def test_llm_provider() -> str:
    settings = get_settings()
    client = _llm_client()
    if settings.llm_provider == "gemini":
        completion = client.chat.completions.create(
            model=settings.gemini_model,
            messages=[{"role": "user", "content": "Reply exactly ok"}],
        )
        output = completion.choices[0].message.content
    else:
        response = client.responses.create(
            model=settings.openai_model,
            input="Reply exactly ok",
        )
        output = response.output_text
    if not output:
        raise RuntimeError("The selected LLM provider returned no text.")
    return output


def _page_context(pages: list[dict[str, Any]], max_chars: int = 80_000) -> str:
    chunks: list[str] = []
    used = 0
    for page in pages:
        text = page.get("text") or "[Text extraction failed or page contains no extractable text.]"
        headings = ", ".join(page.get("detected_headings") or [])
        refs = ", ".join(page.get("detected_references") or [])
        chunk = f"\n--- PAGE {page['page_number']} ---\nDetected headings: {headings or 'none'}\nDetected references: {refs or 'none'}\n{text}\n"
        if used + len(chunk) > max_chars:
            remaining = max_chars - used
            if remaining > 400:
                chunks.append(chunk[:remaining] + "\n[PAGE TEXT TRUNCATED]")
            break
        chunks.append(chunk)
        used += len(chunk)
    return "".join(chunks)


def _gemini_structured(system: str, prompt: str, model_type: type[T]) -> T:
    completion = _llm_client().beta.chat.completions.parse(
        model=get_settings().gemini_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        response_format=model_type,
    )
    message = completion.choices[0].message
    if message.parsed:
        return message.parsed
    if message.content:
        return model_type.model_validate_json(message.content)
    raise RuntimeError("Gemini did not return a valid structured response.")


def _structured(system: str, prompt: str, model_type: type[T]) -> T:
    settings = get_settings()
    if settings.llm_provider == "gemini":
        return _gemini_structured(system, prompt, model_type)
    response = _llm_client().responses.parse(
        model=settings.openai_model,
        input=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        text_format=model_type,
    )
    if not response.output_parsed:
        raise RuntimeError("OpenAI did not return a valid structured response.")
    return response.output_parsed


def reading_route(title: str, pages: list[dict[str, Any]]) -> ReadingRouteResponse:
    system = """You are a rigorous guided-reading tutor. Use only the supplied extracted PDF text and detection metadata. Never invent a page, heading, table, or figure. Use null for uncertain pages and explicitly mark uncertain detected items in prose. The compatibility field 'chapter_7_use' should describe how the source could support later study, review, or writing."""
    return _structured(system, f"Create a practical reading route for {title!r}.\n{_page_context(pages)}", ReadingRouteResponse)


def podcast_script(title: str, pages: list[dict[str, Any]], duration: int, mode: str = "normal", scope_type: str = "document") -> PodcastResponse:
    system = """You create a guided document walkthrough grounded only in the supplied extracted PDF text and detection metadata. Return a short sequence of narration cues that a browser can speak one at a time while moving through the PDF.

Rules for every cue:
- Keep narration_text short: one to three sentences and no more than about 70 words.
- Use the page number from the PAGE block containing the supporting text. Use null only when no page can be established.
- quote_to_highlight must be a short exact verbatim excerpt from that same page, or null when no reliable excerpt is available.
- Use highlight only with a reliable exact quote. Use scroll to move to a supported page, and pause for a reflection cue that does not require navigation.
- Use inspect_table, inspect_figure, or inspect_formula only when the item is visible in that page's extracted text or detected references. Never infer one from the topic alone.
- Use checkpoint_question after major ideas, formulas, or method steps. Use compare_pages only when both pages are supplied and relevant.
- narration_text must explain or paraphrase content supported by that page. Acknowledge missing or failed extraction instead of filling gaps.
- Give every cue a unique stable cue_id, a realistic estimated_seconds value, and an importance level.

Keep the existing compatibility fields. script must be the readable full transcript in the same order as the cues; page_directions, pause_points, and chapter_7_takeaways should remain concise."""
    prompt = f"Create a roughly {duration}-minute {mode} guided-reading episode for {title!r}, scoped to {scope_type}. Break it into short, sequential cues suitable for listen, scroll, inspect, checkpoint, and continue playback.\n{_page_context(pages)}"
    result = _structured(system, prompt, PodcastResponse)
    result.cues = _ground_podcast_cues(result.cues, pages)
    return result


def _normalized(value: str) -> str:
    return " ".join(value.casefold().split())


def _ground_podcast_cues(cues: list[PodcastCue], pages: list[dict[str, Any]]) -> list[PodcastCue]:
    """Remove navigation claims that are not supported by the extracted page data."""
    page_map = {int(page["page_number"]): page for page in pages}
    grounded: list[PodcastCue] = []
    used_ids: set[str] = set()

    for index, cue in enumerate(cues, start=1):
        page = page_map.get(cue.page_number) if cue.page_number is not None else None
        if page is None:
            cue.page_number = None
            cue.quote_to_highlight = None
            if cue.action != "pause":
                cue.action = "pause"
        else:
            page_text = page.get("text") or ""
            normalized_page = _normalized(page_text)
            quote = (cue.quote_to_highlight or "").strip()
            if not quote or _normalized(quote) not in normalized_page:
                cue.quote_to_highlight = None
                if cue.action == "highlight":
                    cue.action = "scroll"

            evidence = " ".join(
                [page_text, *(page.get("detected_references") or [])]
            ).casefold()
            if cue.action == "inspect_table" and not re.search(r"\btable\b", evidence):
                cue.action = "highlight" if cue.quote_to_highlight else "scroll"
            if cue.action == "inspect_figure" and not re.search(r"\b(?:figure\b|fig\.)", evidence):
                cue.action = "highlight" if cue.quote_to_highlight else "scroll"
            if cue.action == "inspect_formula" and not re.search(r"\b(?:equation|formula|eq\.)\b|[=∑∫]", evidence):
                cue.action = "highlight" if cue.quote_to_highlight else "scroll"
            if cue.page_range:
                cue.page_range = [number for number in cue.page_range if number in page_map][:2] or None
            if cue.action == "compare_pages" and (not cue.page_range or len(cue.page_range) < 2):
                cue.action = "scroll"

        base_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", cue.cue_id).strip("-") or f"cue-{index}"
        unique_id = base_id
        suffix = 2
        while unique_id in used_ids:
            unique_id = f"{base_id}-{suffix}"
            suffix += 1
        cue.cue_id = unique_id
        used_ids.add(unique_id)
        grounded.append(cue)

    return grounded


def _pages_in_range(pages: list[dict[str, Any]], page_start: int | None, page_end: int | None) -> list[dict[str, Any]]:
    if page_start is None and page_end is None:
        return pages
    start = page_start or 1
    end = page_end or start
    if end < start:
        start, end = end, start
    return [page for page in pages if start <= int(page["page_number"]) <= end]


def chapter_map(title: str, pages: list[dict[str, Any]]) -> DocumentStructureResponse:
    system = """Build a cautious document structure map using extracted headings and page metadata first. Use only supplied pages. Never invent exact chapter or section boundaries. Mark confidence low when headings are weak. Page values must correspond to supplied PAGE blocks. Formula/table/figure claims require visible text or detection metadata."""
    result = _structured(system, f"Map the chapters and sections of {title!r}.\n{_page_context(pages)}", DocumentStructureResponse)
    valid_pages = {int(page["page_number"]) for page in pages}
    for chapter in result.chapters:
        if chapter.page_start not in valid_pages:
            chapter.page_start = None
        if chapter.page_end not in valid_pages:
            chapter.page_end = chapter.page_start
        for section in chapter.sections:
            if section.page_start not in valid_pages:
                section.page_start = None
            if section.page_end not in valid_pages:
                section.page_end = section.page_start
    return result


def section_intro(title: str, pages: list[dict[str, Any]], section_title: str, user_level: str, focus: str) -> SectionIntroResponse:
    system = """Explain only the selected extracted document pages. Ground every claim in those pages and point to page numbers in prose where useful. Never invent formulas, definitions, tables, or prerequisites. When a prerequisite is absent, say exactly that the document does not explain it fully and an external source may be needed. Do not add outside knowledge unless explicitly requested and clearly labeled general background."""
    result = _structured(system, f"Create a {user_level} introduction focused on {focus} for {section_title!r} in {title!r}.\n{_page_context(pages, 45_000)}", SectionIntroResponse)
    numbers = [int(page["page_number"]) for page in pages]
    result.page_range = [min(numbers), max(numbers)] if numbers else []
    return result


def method_walkthrough(title: str, pages: list[dict[str, Any]], user_goal: str) -> MethodWalkthroughResponse:
    system = """Turn only the supplied extracted pages into a reproducible method walkthrough. Distinguish required, optional, and prerequisite reading. Never invent a formula, variable definition, input, decision, or page. If extraction omits needed information, list it as missing. Suggested external topics may name topics only and must not introduce unsupported document claims."""
    result = _structured(system, f"Create a method walkthrough for the goal {user_goal!r} from {title!r}.\n{_page_context(pages, 50_000)}", MethodWalkthroughResponse)
    valid = {int(page["page_number"]) for page in pages}
    result.page_range = [min(valid), max(valid)] if valid else []
    for formula in result.formulas:
        if formula.page_number not in valid:
            formula.page_number = None
    for step in result.step_by_step_procedure:
        if step.page_number not in valid:
            step.page_number = None
    return result


def concept_guide(title: str, pages: list[dict[str, Any]], concept: str) -> ConceptGuideResponse:
    system = """Trace a concept only through the supplied extracted document pages. Identify where it is defined and used, related formulas and visuals, prerequisites, and a reading sequence. Cite pages in list entries. Never invent a location or claim; put absent information in gaps_not_found_in_document."""
    return _structured(system, f"Trace {concept!r} through {title!r}.\n{_page_context(pages, 50_000)}", ConceptGuideResponse)


def update_structured_response(response_type: str, original: dict | str, instruction: str, context: dict, pages: list[dict[str, Any]]) -> tuple[dict | str, str]:
    model_types: dict[str, type[BaseModel]] = {
        "reading_route": ReadingRouteResponse,
        "guided_reading": PodcastResponse,
        "chapter_map": DocumentStructureResponse,
        "section_intro": SectionIntroResponse,
        "method_walkthrough": MethodWalkthroughResponse,
        "concept_guide": ConceptGuideResponse,
    }
    system = """Revise the supplied response according to the user's instruction while remaining grounded only in the supplied extracted PDF pages. Preserve the requested response schema. Never invent page numbers, quotes, formulas, tables, figures, chapters, or definitions. If the instruction cannot be fulfilled from the document, state the limitation in an appropriate field."""
    prompt = f"Response type: {response_type}\nInstruction: {instruction}\nCurrent context: {context}\nOriginal response: {original}\nDocument evidence:\n{_page_context(pages, 45_000)}"
    if response_type == "ask_answer":
        updated = answer_question(f"Update this prior answer using this instruction: {instruction}. Prior answer: {original}", pages)
        return updated, "Revised the answer using the requested emphasis while retaining document grounding."
    model_type = model_types[response_type]
    result = _structured(system, prompt, model_type)
    if isinstance(result, PodcastResponse):
        result.cues = _ground_podcast_cues(result.cues, pages)
    return result.model_dump(mode="json"), "Updated the response using the instruction while preserving its schema and document grounding."


def _relevant_pages(question: str, pages: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    terms = [word for word in re.findall(r"[a-zA-Z]{3,}", question.lower()) if word not in {"the", "and", "for", "that", "this", "what", "where", "how"}]
    counts = Counter(terms)
    scored = []
    for page in pages:
        text = (page.get("text") or "").lower()
        score = sum(text.count(term) * weight for term, weight in counts.items())
        scored.append((score, page))
    ranked = [page for score, page in sorted(scored, key=lambda item: item[0], reverse=True) if score > 0]
    return ranked[:limit] or pages[: min(limit, len(pages))]


def answer_question(question: str, pages: list[dict[str, Any]]) -> str:
    settings = get_settings()
    context = _page_context(_relevant_pages(question, pages), max_chars=45_000)
    system = """Answer only from the supplied extracted document pages. Cite every substantive claim with page citations like [p. 4] or [pp. 4-5]. Do not use outside knowledge. Never claim an exact table, figure, or page if it is not visible in the context. If the answer is not supported, say that it was not found. If text is missing or extraction failed, state that limitation."""
    prompt = f"Question: {question}\n\nDocument pages:{context}"
    client = _llm_client()
    if settings.llm_provider == "gemini":
        completion = client.chat.completions.create(
            model=settings.gemini_model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        )
        output = completion.choices[0].message.content
    else:
        response = client.responses.create(
            model=settings.openai_model,
            input=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        )
        output = response.output_text
    if not output:
        raise RuntimeError("The selected LLM provider returned no answer text.")
    return output


def synthesize_speech(script: str) -> bytes:
    settings = get_settings()
    if settings.llm_provider == "gemini":
        raise ProviderCapabilityError("Text-to-speech is not supported when LLM_PROVIDER=gemini.")
    response = _openai_client().audio.speech.create(
        model=settings.openai_tts_model,
        voice=settings.openai_tts_voice,
        input=script,
        response_format="mp3",
    )
    return response.content
