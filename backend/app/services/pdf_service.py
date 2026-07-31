import re
from dataclasses import dataclass

import fitz

HEADING_NUMBER = re.compile(r"^(?:\d+(?:\.\d+)*|[IVXLC]+)[.)]?\s+[A-Z].{1,100}$")
TOC_PATTERN = re.compile(r".{3,100}\.{3,}\s*\d+$")
REFERENCE_PATTERN = re.compile(
    r"\b(?:Table|Figure|Fig\.|Appendix|Summary|Conclusions?|References)\s*(?:[A-Z]?\d+(?:\.\d+)*)?",
    re.IGNORECASE,
)


@dataclass
class ExtractedPage:
    page_number: int
    text: str
    detected_headings: list[str]
    detected_references: list[str]


def _headings(text: str) -> list[str]:
    result: list[str] = []
    for raw in text.splitlines():
        line = " ".join(raw.split()).strip()
        if not line or len(line) > 120 or len(line) < 3:
            continue
        is_upper = any(char.isalpha() for char in line) and line == line.upper()
        looks_numbered = bool(HEADING_NUMBER.match(line))
        looks_toc = bool(TOC_PATTERN.match(line))
        short_title = len(line) < 70 and line[0].isupper() and not line.endswith((".", ",", ";"))
        if is_upper or looks_numbered or looks_toc or short_title:
            result.append(line)
    return list(dict.fromkeys(result))[:20]


def extract_pdf(file_bytes: bytes) -> tuple[list[ExtractedPage], dict[str, str]]:
    try:
        pdf = fitz.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError("The uploaded file is not a readable PDF.") from exc
    metadata = {key: value for key, value in (pdf.metadata or {}).items() if value}
    pages: list[ExtractedPage] = []
    for index, page in enumerate(pdf):
        text = page.get_text("text").strip()
        references = list(dict.fromkeys(match.group(0).strip() for match in REFERENCE_PATTERN.finditer(text)))
        pages.append(ExtractedPage(index + 1, text, _headings(text), references[:30]))
    pdf.close()
    return pages, metadata

