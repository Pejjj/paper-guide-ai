import re
from dataclasses import asdict, dataclass
from typing import Any

import fitz

HEADING_NUMBER = re.compile(r"^(?:\d+(?:\.\d+)*|[IVXLC]+)[.)]?\s+[A-Z].{1,100}$", re.IGNORECASE)
TOC_PATTERN = re.compile(r".{3,100}\.{3,}\s*(?:\d+-)?\d+$")
PRINTED_PAGE_PATTERN = re.compile(r"^\s*(\d{1,2}\s*[-–]\s*\d{1,3}|[ivxlcdm]{1,8}|\d{1,4})\s*$", re.IGNORECASE)
TABLE_PATTERN = re.compile(r"^\s*(Table\s+[A-Z]?(?:\d+(?:[-.]\d+)*))(?:\s*[-:.]\s*|\s+)(.{0,180})$", re.IGNORECASE)
FIGURE_PATTERN = re.compile(r"^\s*((?:Figure|Fig\.)\s+[A-Z]?(?:\d+(?:[-.]\d+)*))(?:\s*[-:.]\s*|\s+)(.{0,180})$", re.IGNORECASE)
EQUATION_LABEL = re.compile(r"\b(?:Eq(?:uation)?\.?\s*\(?\d+[a-z]?\)?|\(\d{1,3}[a-z]?\))\b", re.IGNORECASE)
REFERENCE_PATTERN = re.compile(r"\b(?:Table|Figure|Fig\.|Appendix|Summary|Conclusions?|References)\s*(?:[A-Z]?\d+(?:[-.]\d+)*)?", re.IGNORECASE)
MATH_SYMBOLS = re.compile(r"[=≤≥Σ∑βφγστΔ√]|\b(?:sin|cos|tan|log)\s*\(", re.IGNORECASE)


@dataclass
class DetectedItem:
    item_id: str
    item_type: str
    label: str
    title_or_text: str
    page_number: int
    printed_page_label: str | None
    confidence: str
    supporting_text_snippet: str


@dataclass
class ExtractedPage:
    page_number: int
    physical_page_number: int
    printed_page_label: str | None
    text: str
    detected_headings: list[str]
    detected_references: list[str]
    detected_formulas: list[dict[str, Any]]
    detected_tables: list[dict[str, Any]]
    detected_figures: list[dict[str, Any]]


def _clean(line: str) -> str:
    return " ".join(line.split()).strip()


def _headings(text: str) -> list[str]:
    result: list[str] = []
    for raw in text.splitlines():
        line = _clean(raw)
        if not line or len(line) > 120 or len(line) < 3:
            continue
        is_upper = any(char.isalpha() for char in line) and line == line.upper()
        looks_numbered = bool(HEADING_NUMBER.match(line))
        looks_toc = bool(TOC_PATTERN.match(line))
        short_title = len(line) < 70 and line[0].isupper() and not line.endswith((".", ",", ";"))
        if is_upper or looks_numbered or looks_toc or short_title:
            result.append(line)
    return list(dict.fromkeys(result))[:30]


def _printed_page_label(page: fitz.Page, text: str) -> str | None:
    height = page.rect.height
    edge_text = page.get_text("text", clip=fitz.Rect(0, 0, page.rect.width, height * 0.13))
    edge_text += "\n" + page.get_text("text", clip=fitz.Rect(0, height * 0.87, page.rect.width, height))
    candidates = [_clean(line) for line in edge_text.splitlines()]
    for line in reversed(candidates):
        match = PRINTED_PAGE_PATTERN.fullmatch(line)
        if match:
            return re.sub(r"\s*[-–]\s*", "-", match.group(1))
    # Some PDF producers return footer text outside the clipping order.
    for line in reversed([_clean(value) for value in text.splitlines()[-8:]]):
        match = PRINTED_PAGE_PATTERN.fullmatch(line)
        if match:
            return re.sub(r"\s*[-–]\s*", "-", match.group(1))
    return None


def _item(item_type: str, label: str, value: str, page: int, printed: str | None, confidence: str = "high") -> dict[str, Any]:
    stable = re.sub(r"[^a-z0-9]+", "-", f"{item_type}-{page}-{label}".casefold()).strip("-")
    snippet = _clean(value)[:260]
    return asdict(DetectedItem(stable, item_type, label, snippet, page, printed, confidence, snippet))


def _detected_items(text: str, page: int, printed: str | None) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    formulas: list[dict[str, Any]] = []
    tables: list[dict[str, Any]] = []
    figures: list[dict[str, Any]] = []
    for raw in text.splitlines():
        line = _clean(raw)
        if not line or len(line) > 300:
            continue
        table = TABLE_PATTERN.match(line)
        figure = FIGURE_PATTERN.match(line)
        if table:
            tables.append(_item("table", table.group(1), line, page, printed))
        elif figure:
            figures.append(_item("figure", figure.group(1), line, page, printed))
        if 3 <= len(line) <= 220 and (EQUATION_LABEL.search(line) or MATH_SYMBOLS.search(line)):
            # Avoid prose lines with a single equality-like character unless the line is variable-heavy.
            tokens = re.findall(r"[A-Za-zα-ωΑ-Ω]+", line)
            symbol_count = len(re.findall(r"[=≤≥+\-*/()Σ∑βφγστΔ√]", line))
            if EQUATION_LABEL.search(line) or symbol_count >= 1 and (len(tokens) <= 18 or len(line) <= 100):
                label_match = EQUATION_LABEL.search(line)
                formulas.append(_item("formula", label_match.group(0) if label_match else "Equation", line, page, printed, "high" if label_match else "medium"))
    unique = lambda values: list({value["item_id"]: value for value in values}.values())[:40]
    return unique(formulas), unique(tables), unique(figures)


def extract_pdf(file_bytes: bytes) -> tuple[list[ExtractedPage], dict[str, Any]]:
    try:
        pdf = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError("The uploaded file is not a readable PDF.") from exc
    metadata: dict[str, Any] = {key: value for key, value in (pdf.metadata or {}).items() if value}
    metadata["outline"] = [
        {"level": int(level), "title": _clean(title), "page_number": int(page_number)}
        for level, title, page_number, *_ in pdf.get_toc(simple=False)
        if page_number and int(page_number) > 0 and _clean(title)
    ]
    metadata["structure_version"] = 2
    pages: list[ExtractedPage] = []
    for index, page in enumerate(pdf):
        text = page.get_text("text").strip()
        physical = index + 1
        printed = _printed_page_label(page, text)
        formulas, tables, figures = _detected_items(text, physical, printed)
        references = list(dict.fromkeys(match.group(0).strip() for match in REFERENCE_PATTERN.finditer(text)))
        pages.append(ExtractedPage(physical, physical, printed, text, _headings(text), references[:30], formulas, tables, figures))
    pdf.close()
    return pages, metadata
