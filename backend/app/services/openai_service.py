import re
from collections import Counter
from typing import Any, TypeVar

from openai import OpenAI
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.models import PodcastCue, PodcastResponse, ReadingRouteResponse

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
    system = """You are a rigorous guided-reading tutor. Use only the supplied extracted PDF text and detection metadata. Never invent a page, heading, table, or figure. Use null for uncertain pages and explicitly mark uncertain detected items in prose. 'chapter_7_use' means how the source could support a dissertation literature-review chapter; do not assume the user's actual chapter topic."""
    return _structured(system, f"Create a practical reading route for {title!r}.\n{_page_context(pages)}", ReadingRouteResponse)


def podcast_script(title: str, pages: list[dict[str, Any]], duration: int) -> PodcastResponse:
    system = """You create a guided document walkthrough grounded only in the supplied extracted PDF text and detection metadata. Return a short sequence of narration cues that a browser can speak one at a time while moving through the PDF.

Rules for every cue:
- Keep narration_text short: one to three sentences and no more than about 70 words.
- Use the page number from the PAGE block containing the supporting text. Use null only when no page can be established.
- quote_to_highlight must be a short exact verbatim excerpt from that same page, or null when no reliable excerpt is available.
- Use highlight only with a reliable exact quote. Use scroll to move to a supported page, and pause for a reflection cue that does not require navigation.
- Use inspect_table or inspect_figure only when Table, Figure, or Fig. is visible in that page's extracted text or detected references. Never infer a visual from the topic alone.
- narration_text must explain or paraphrase content supported by that page. Acknowledge missing or failed extraction instead of filling gaps.
- Give every cue a unique stable cue_id, a realistic estimated_seconds value, and an importance level.

Keep the existing compatibility fields. script must be the readable full transcript in the same order as the cues; page_directions, pause_points, and chapter_7_takeaways should remain concise."""
    prompt = f"Create a roughly {duration}-minute guided-reading episode for {title!r}. Break it into short, sequential cues suitable for listen, scroll, inspect, pause, and continue playback.\n{_page_context(pages)}"
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
