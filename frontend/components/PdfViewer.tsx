"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Eye, Loader2, Search, ZoomIn, ZoomOut } from "lucide-react";
import type { LearningScope, PodcastCue } from "@/lib/types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  activeCue: PodcastCue | null;
  currentPage: number;
  selectedScope: LearningScope | null;
  highlightText?: string | null;
  onPageChange: (page: number) => void;
  onClearScope: () => void;
}

export function PdfViewer({ url, activeCue, currentPage, selectedScope, highlightText, onPageChange, onClearScope }: PdfViewerProps) {
  const [pages, setPages] = useState(0);
  const [visiblePage, setVisiblePage] = useState(1);
  const [scale, setScale] = useState(1.05);
  const [pageInput, setPageInput] = useState("1");
  const scroller = useRef<HTMLDivElement>(null);
  const pageNodes = useRef(new Map<number, HTMLDivElement>());
  const registerPage = useCallback((number: number, node: HTMLDivElement | null) => { if (node) pageNodes.current.set(number, node); else pageNodes.current.delete(number); }, []);

  const goToPage = useCallback((number: number, behavior: ScrollBehavior = "smooth") => {
    const target = Math.min(Math.max(number, 1), pages || number);
    pageNodes.current.get(target)?.scrollIntoView({ block: "start", behavior });
  }, [pages]);

  useEffect(() => {
    if (activeCue?.page_number) goToPage(activeCue.page_number);
  }, [activeCue?.cue_id, activeCue?.page_number, goToPage]);

  useEffect(() => {
    if (currentPage !== visiblePage) goToPage(currentPage);
  }, [currentPage, goToPage, visiblePage]);

  useEffect(() => { setPageInput(String(visiblePage)); }, [visiblePage]);

  const reportVisible = useCallback((page: number) => {
    setVisiblePage(page);
    onPageChange(page);
  }, [onPageChange]);

  const outside = Boolean(selectedScope?.page_start && selectedScope?.page_end && (visiblePage < selectedScope.page_start || visiblePage > selectedScope.page_end));
  const cueText = activeCue?.quote_to_highlight ?? activeCue?.cue_title ?? null;
  const cuePage = activeCue?.page_number ?? null;
  const selectedText: string | null = (activeCue ? cueText : highlightText) ?? null;
  const selectedTextPage = activeCue ? cuePage : currentPage;

  return <div className="flex h-full flex-col">
    <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-ink/10 bg-white/90 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-1"><button aria-label="Previous PDF page" className="icon-button" disabled={visiblePage <= 1} onClick={() => goToPage(visiblePage - 1)}><ChevronLeft size={18} /></button><form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); goToPage(Number(pageInput) || visiblePage); }}><input aria-label="PDF page number" value={pageInput} onChange={(event) => setPageInput(event.target.value)} className="w-14 rounded-lg border border-ink/15 px-2 py-1 text-center text-sm" /><span className="text-sm text-ink/45">/ {pages || "—"}</span></form><button aria-label="Next PDF page" className="icon-button" disabled={visiblePage >= pages} onClick={() => goToPage(visiblePage + 1)}><ChevronRight size={18} /></button></div>
      <div className="flex items-center gap-1"><span className="mr-2 hidden items-center gap-1 text-xs text-ink/40 sm:flex"><Search size={13} /> Text-layer highlights</span><button aria-label="Zoom out" className="icon-button" onClick={() => setScale((value) => Math.max(0.65, value - 0.1))}><ZoomOut size={17} /></button><button aria-label="Zoom in" className="icon-button" onClick={() => setScale((value) => Math.min(1.7, value + 0.1))}><ZoomIn size={17} /></button></div>
    </div>
    {selectedScope?.page_start && <div className="shrink-0 border-b border-moss/15 bg-sage/70 px-4 py-3 text-sm"><div className="flex flex-wrap items-center gap-2"><strong>Selected learning scope: PDF pages {selectedScope.page_start}{selectedScope.page_end && selectedScope.page_end !== selectedScope.page_start ? `–${selectedScope.page_end}` : ""}</strong><span className="text-ink/50">Current PDF page: {visiblePage}</span><button className="ml-auto text-moss" onClick={() => goToPage(selectedScope.page_start!)}>Go to start</button><button className="text-moss" onClick={() => goToPage(selectedScope.page_end ?? selectedScope.page_start!)}>Go to end</button><button className="text-ink/50" onClick={onClearScope}>Clear selection</button></div>{outside && <p className="mt-1 text-xs text-ink/50">You are viewing outside the selected learning scope.</p>}</div>}
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-[#e9e6df] px-3 py-5">
      {activeCue && <aside className="sticky top-0 z-30 mx-auto mb-4 max-w-2xl rounded-2xl border border-coral/30 bg-[#fff8ed]/95 p-4 shadow-soft backdrop-blur" aria-live="polite"><div className="flex items-start gap-3"><span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-coral/15 text-coral"><Eye size={17} /></span><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-coral">{activeCue.action.replaceAll("_", " ")}{activeCue.page_number ? ` · PDF page ${activeCue.page_number}` : ""}</p><p className="mt-1 text-sm leading-6 text-ink">{activeCue.quote_to_highlight ? `Look for: “${activeCue.quote_to_highlight}”` : activeCue.narration_text}</p></div></div></aside>}
      <Document file={url} onLoadSuccess={({ numPages }) => setPages(numPages)} loading={<Loader2 className="mx-auto mt-16 animate-spin text-moss" />} error={<p className="mt-16 text-center text-red-700">The private PDF link expired or could not be opened. Refresh the page.</p>}>
        <div className="space-y-5">{Array.from({ length: pages }, (_, index) => index + 1).map((number) => <VirtualPdfPage key={number} number={number} scale={scale} root={scroller.current} selectedScope={selectedScope} highlightText={selectedTextPage === number ? selectedText : null} register={registerPage} onVisible={reportVisible} />)}</div>
      </Document>
    </div>
  </div>;
}

function VirtualPdfPage({ number, scale, root, selectedScope, highlightText, register, onVisible }: { number: number; scale: number; root: HTMLDivElement | null; selectedScope: LearningScope | null; highlightText: string | null; register: (page: number, node: HTMLDivElement | null) => void; onVisible: (page: number) => void }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(number <= 3);
  const inRange = Boolean(selectedScope?.page_start && selectedScope?.page_end && number >= selectedScope.page_start && number <= selectedScope.page_end);

  useEffect(() => { register(number, wrapper.current); return () => register(number, null); }, [number, register]);
  useEffect(() => {
    const node = wrapper.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setNear(true);
        if (entry.intersectionRatio >= 0.35) onVisible(number);
      }
    }, { root, rootMargin: "1200px 0px", threshold: [0, 0.35] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [number, onVisible, root]);

  const applyHighlight = useCallback(() => {
    const node = wrapper.current;
    if (!node) return;
    const spans = Array.from(node.querySelectorAll<HTMLElement>(".react-pdf__Page__textContent span"));
    spans.forEach((span) => span.classList.remove("paperguide-text-highlight"));
    if (!highlightText) return;
    const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const target = normalize(highlightText);
    const words = new Set(target.split(" ").filter((word) => word.length > 3));
    let best: { node: HTMLElement; score: number } | null = null;
    for (const span of spans) {
      const value = normalize(span.textContent ?? "");
      if (!value) continue;
      const exact = value.includes(target) || (target.includes(value) && value.length > 8);
      const overlap = value.split(" ").filter((word) => words.has(word)).length / Math.max(words.size, 1);
      const score = exact ? 2 : overlap;
      if (!best || score > best.score) best = { node: span, score };
    }
    if (best && best.score >= 0.4) best.node.classList.add("paperguide-text-highlight");
  }, [highlightText]);

  useEffect(() => { if (near) window.setTimeout(applyHighlight, 100); }, [applyHighlight, near, scale]);
  return <div ref={wrapper} data-pdf-page={number} className={`relative mx-auto min-h-[760px] w-fit scroll-mt-4 rounded-lg border-2 ${inRange ? "border-moss/35" : "border-transparent"}`}><span className={`absolute -left-2 top-2 z-20 -translate-x-full rounded-full px-2 py-1 text-[10px] font-semibold ${inRange ? "bg-moss text-white" : "bg-white/80 text-ink/45"}`}>{number}</span>{near ? <Page pageNumber={number} scale={scale} className="overflow-hidden rounded shadow-soft" onRenderTextLayerSuccess={applyHighlight} /> : <div style={{ width: `${595 * scale}px`, height: `${842 * scale}px` }} className="grid place-items-center bg-white text-xs text-ink/30">PDF page {number}</div>}</div>;
}
