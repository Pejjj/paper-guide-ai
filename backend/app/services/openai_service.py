import re
from collections import Counter
from typing import Any, TypeVar

from openai import OpenAI
from pydantic import BaseModel

from app.config import get_settings
from app.models import PodcastResponse, ReadingRouteResponse

T = TypeVar("T", bound=BaseModel)


def _client() -> OpenAI:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OpenAI is not configured")
    return OpenAI(api_key=settings.openai_api_key)


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


def _structured(system: str, prompt: str, model_type: type[T]) -> T:
    settings = get_settings()
    response = _client().responses.parse(
        model=settings.openai_model,
        input=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        text_format=model_type,
    )
    if not response.output_parsed:
        raise RuntimeError("The model did not return a valid structured response.")
    return response.output_parsed


def reading_route(title: str, pages: list[dict[str, Any]]) -> ReadingRouteResponse:
    system = """You are a rigorous guided-reading tutor. Use only the supplied extracted PDF text and detection metadata. Never invent a page, heading, table, or figure. Use null for uncertain pages and explicitly mark uncertain detected items in prose. 'chapter_7_use' means how the source could support a dissertation literature-review chapter; do not assume the user's actual chapter topic."""
    return _structured(system, f"Create a practical reading route for {title!r}.\n{_page_context(pages)}", ReadingRouteResponse)


def podcast_script(title: str, pages: list[dict[str, Any]], duration: int) -> PodcastResponse:
    system = """You write an engaging single-host tutor podcast grounded only in supplied PDF text. Cite page numbers conversationally when supported. Never claim an exact page/table/figure unless present in the provided page block or detection metadata. When extraction is missing, say so. Build pauses and page directions that help the listener inspect the PDF."""
    prompt = f"Write a roughly {duration}-minute guided explanation of {title!r}. The script should sound natural when spoken aloud.\n{_page_context(pages)}"
    return _structured(system, prompt, PodcastResponse)


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
    context = _page_context(_relevant_pages(question, pages), max_chars=45_000)
    system = """Answer only from the supplied extracted document pages. Cite every substantive claim with page citations like [p. 4] or [pp. 4–5]. Do not use outside knowledge. Never claim an exact table, figure, or page if it is not visible in the context. If the answer is not supported, say that it was not found. If text is missing or extraction failed, state that limitation."""
    response = _client().responses.create(model=get_settings().openai_model, input=[{"role": "system", "content": system}, {"role": "user", "content": f"Question: {question}\n\nDocument pages:{context}"}])
    return response.output_text


def synthesize_speech(script: str) -> bytes:
    settings = get_settings()
    response = _client().audio.speech.create(model=settings.openai_tts_model, voice=settings.openai_tts_voice, input=script, response_format="mp3")
    return response.content

