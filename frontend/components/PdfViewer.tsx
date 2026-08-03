"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Eye, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import type { PodcastCue } from "@/lib/types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps { url: string; activeCue: PodcastCue | null; currentPage: number; onPageChange: (page: number) => void; }

export function PdfViewer({ url, activeCue, currentPage, onPageChange }: PdfViewerProps) {
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.05);
  const [highlightFound, setHighlightFound] = useState(false);
  const pageRoot = useRef<HTMLDivElement>(null);

  useEffect(() => { if (activeCue?.page_number) setPage(Math.min(Math.max(activeCue.page_number, 1), pages || activeCue.page_number)); }, [activeCue, pages]);
  useEffect(() => { setPage(Math.min(Math.max(currentPage, 1), pages || currentPage)); }, [currentPage, pages]);
  useEffect(() => { onPageChange(page); }, [onPageChange, page]);

  const applyHighlight = useCallback(() => {
    const root = pageRoot.current;
    if (!root) return;
    const spans = Array.from(root.querySelectorAll<HTMLElement>(".react-pdf__Page__textContent span"));
    spans.forEach((span) => span.classList.remove("paperguide-text-highlight"));
    const target = activeCue?.quote_to_highlight?.trim() || activeCue?.cue_title?.trim();
    if (!target || activeCue?.page_number !== page) { setHighlightFound(false); return; }
    const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const normalizedTarget = normalize(target);
    const words = new Set(normalizedTarget.split(" ").filter((word) => word.length > 3));
    let best: { span: HTMLElement; score: number } | null = null;
    for (const span of spans) {
      const value = normalize(span.textContent ?? "");
      if (!value) continue;
      const exact = value.includes(normalizedTarget) || (normalizedTarget.includes(value) && value.length > 8);
      const overlap = value.split(" ").filter((word) => words.has(word)).length / Math.max(words.size, 1);
      const score = exact ? 2 : overlap;
      if (!best || score > best.score) best = { span, score };
    }
    if (best && best.score >= 0.45) {
      best.span.classList.add("paperguide-text-highlight");
      best.span.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlightFound(true);
    } else setHighlightFound(false);
  }, [activeCue, page]);

  useEffect(() => { const timer = window.setTimeout(applyHighlight, 120); return () => window.clearTimeout(timer); }, [applyHighlight, scale]);
  const showCue = activeCue && (!activeCue.page_number || activeCue.page_number === page);

  return <div className="flex h-full flex-col">
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink/10 bg-white/80 px-4 backdrop-blur">
      <div className="flex items-center gap-1"><button aria-label="Previous page" className="icon-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={18} /></button><span className="min-w-20 text-center text-sm text-ink/60">{page} / {pages || "—"}</span><button aria-label="Next page" className="icon-button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}><ChevronRight size={18} /></button></div>
      <div className="flex gap-1"><button aria-label="Zoom out" className="icon-button" onClick={() => setScale((value) => Math.max(0.65, value - 0.1))}><ZoomOut size={17} /></button><button aria-label="Zoom in" className="icon-button" onClick={() => setScale((value) => Math.min(2, value + 0.1))}><ZoomIn size={17} /></button></div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto p-5">
      {showCue && <aside className="sticky top-0 z-20 mx-auto mb-4 max-w-2xl rounded-2xl border border-coral/30 bg-[#fff8ed]/95 p-4 shadow-soft backdrop-blur" aria-live="polite"><div className="flex items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-coral/15 text-coral"><Eye size={17} /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-coral">{activeCue.action.replaceAll("_", " ")}{activeCue.page_number ? ` · Page ${activeCue.page_number}` : ""}</p><p className="mt-1 text-sm leading-6 text-ink">{activeCue.quote_to_highlight ? `Look for: “${activeCue.quote_to_highlight}”` : activeCue.narration_text}</p>{activeCue.quote_to_highlight && <p className="mt-1 text-xs text-ink/45">{highlightFound ? "Matched in the PDF text layer." : "Text-layer match unavailable; use this inspection card as the fallback."}</p>}</div></div></aside>}
      <div ref={pageRoot}><Document file={url} onLoadSuccess={({ numPages }) => setPages(numPages)} loading={<Loader2 className="mx-auto mt-16 animate-spin text-moss" />} error={<p className="mt-16 text-center text-red-700">The private PDF link expired or could not be opened. Refresh the page.</p>}><Page pageNumber={page} scale={scale} className="mx-auto w-fit overflow-hidden rounded shadow-soft" onRenderTextLayerSuccess={applyHighlight} /></Document></div>
    </div>
  </div>;
}
