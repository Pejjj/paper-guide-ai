import re
from typing import Any

from app.models import (
    DefinitionFormulaItem,
    DefinitionIndexResponse,
    DefinitionItem,
    ReadMoreItem,
    SymbolDefinitionItem,
)

EXPLICIT_DEFINITION = re.compile(
    r"(?P<term>[A-Z][A-Za-z0-9][A-Za-z0-9 /()\-]{1,70}?)\s+(?:is defined as|refers to|means|is the)\s+(?P<definition>[^.;\n]{8,240})",
    re.IGNORECASE,
)
SYMBOL_DEFINITION = re.compile(
    r"(?:where|in which)\s+(?P<symbol>[A-Za-zα-ωΑ-Ω][A-Za-z0-9_]{0,5})\s*(?:=|is)\s*(?P<meaning>[^.;\n]{3,160})",
    re.IGNORECASE,
)
CITATION = re.compile(r"\((?P<author>[A-Z][A-Za-z'\-]+)(?:\s+et\s+al\.)?,?\s+(?P<year>(?:19|20)\d{2})\)")
REFERENCE_LINE = re.compile(r"^(?P<line>.{10,260}(?:19|20)\d{2}.{0,180})$", re.MULTILINE)
STOP_TERMS = {"this", "that", "there", "it", "figure", "table", "equation", "chapter", "section"}


def _stable(prefix: str, value: str, page: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")[:60]
    return f"{prefix}-{page}-{slug or 'item'}"


def _usage_pages(term: str, pages: list[dict[str, Any]], defined_page: int, limit: int = 8) -> list[int]:
    pattern = re.compile(rf"\b{re.escape(term)}\b", re.IGNORECASE)
    return [int(page["page_number"]) for page in pages if int(page["page_number"]) != defined_page and pattern.search(page.get("text") or "")][:limit]


def _inside_document(term: str, pages: list[dict[str, Any]], defined_page: int) -> list[ReadMoreItem]:
    result: list[ReadMoreItem] = []
    for number in _usage_pages(term, pages, defined_page, 4):
        result.append(ReadMoreItem(label=f"{term} used on PDF page {number}", page_number=number, why_relevant="This page uses the same term elsewhere in the document.", guidance_type="inside_document"))
    return result


def cited_references_for_term(term: str, pages: list[dict[str, Any]]) -> list[ReadMoreItem]:
    citations: set[tuple[str, str]] = set()
    for page in pages:
        text = page.get("text") or ""
        for line in text.splitlines():
            if term.casefold() in line.casefold():
                citations.update((match.group("author"), match.group("year")) for match in CITATION.finditer(line))
    if not citations:
        return []
    result: list[ReadMoreItem] = []
    for page in pages:
        text = page.get("text") or ""
        if "references" not in text.casefold() and not any("reference" in str(value).casefold() for value in page.get("detected_headings") or []):
            continue
        for match in REFERENCE_LINE.finditer(text):
            line = " ".join(match.group("line").split())
            if any(author.casefold() in line.casefold() and year in line for author, year in citations):
                result.append(ReadMoreItem(label=line[:220], page_number=int(page["page_number"]), printed_page_label=page.get("printed_page_label"), why_relevant=f"This bibliography entry matches a citation near {term!r}.", guidance_type="cited_reference"))
    return result[:8]


def extract_definition_index(title: str, scope_title: str, pages: list[dict[str, Any]]) -> DefinitionIndexResponse:
    definitions: list[DefinitionItem] = []
    symbols: list[SymbolDefinitionItem] = []
    formulas: list[DefinitionFormulaItem] = []
    seen_terms: set[str] = set()
    seen_symbols: set[str] = set()

    for page in pages:
        number = int(page["page_number"])
        printed = page.get("printed_page_label")
        text = page.get("text") or ""
        for match in EXPLICIT_DEFINITION.finditer(text):
            term = " ".join(match.group("term").split()).strip(" ,:")
            definition = " ".join(match.group("definition").split())
            key = term.casefold()
            if key in seen_terms or key in STOP_TERMS or len(term.split()) > 8:
                continue
            seen_terms.add(key)
            quote = " ".join(match.group(0).split())[:300]
            definitions.append(DefinitionItem(
                definition_id=_stable("definition", term, number), term=term,
                short_definition=definition, technical_definition=definition,
                page_defined=number, printed_page_label=printed, quote_or_snippet=quote,
                confidence="high", where_used_pages=_usage_pages(term, pages, number),
                related_terms=[], related_formulas=[], read_more_inside_document=_inside_document(term, pages, number),
                source_type="explicit_definition",
            ))
        for match in SYMBOL_DEFINITION.finditer(text):
            symbol = match.group("symbol")
            key = symbol.casefold()
            if key in seen_symbols:
                continue
            seen_symbols.add(key)
            symbols.append(SymbolDefinitionItem(symbol=symbol, meaning=" ".join(match.group("meaning").split()), page_defined=number, printed_page_label=printed, formula_context=" ".join(match.group(0).split()), confidence="high"))
        for raw in page.get("detected_formulas") or []:
            formula_text = str(raw.get("title_or_text") or "").strip()
            if not formula_text:
                continue
            variables = sorted(set(re.findall(r"\b[A-Za-zα-ωΑ-Ω]\b", formula_text)))
            explained = [symbol.symbol for symbol in symbols if symbol.page_defined == number and symbol.symbol in variables]
            formulas.append(DefinitionFormulaItem(
                formula_id=str(raw.get("item_id") or _stable("formula", formula_text, number)), formula_text=formula_text,
                label=str(raw.get("label") or "Equation"), page_number=number, printed_page_label=printed,
                variables_explained=explained, variables_missing=[value for value in variables if value not in explained],
                related_terms=[], confidence=str(raw.get("confidence") or "medium"),
            ))

    numbers = [int(page["page_number"]) for page in pages]
    order = [item.definition_id for item in definitions] + [item.formula_id for item in formulas]
    return DefinitionIndexResponse(
        document_title=title, scope_title=scope_title,
        page_range=[min(numbers), max(numbers)] if numbers else [], definitions=definitions[:80],
        symbols=symbols[:80], formulas=formulas[:80], suggested_learning_order=order[:80],
    )
