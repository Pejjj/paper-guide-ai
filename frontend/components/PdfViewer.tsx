"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Eye, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import type { PodcastCue } from "@/lib/types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  url: string;
  activeCue: PodcastCue | null;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export function PdfViewer({ url, activeCue, currentPage, onPageChange }: PdfViewerProps) {
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.05);

  useEffect(() => {
    if (!activeCue?.page_number) return;
    setPage(Math.min(Math.max(activeCue.page_number, 1), pages || activeCue.page_number));
  }, [activeCue, pages]);

  useEffect(() => {
    setPage(Math.min(Math.max(currentPage, 1), pages || currentPage));
  }, [currentPage, pages]);

  useEffect(() => { onPageChange(page); }, [onPageChange, page]);

  const showCue = activeCue && (!activeCue.page_number || activeCue.page_number === page);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink/10 bg-white/80 px-4 backdrop-blur">
        <div className="flex items-center gap-1"><button aria-label="Previous page" className="icon-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={18} /></button><span className="min-w-20 text-center text-sm text-ink/60">{page} / {pages || "—"}</span><button aria-label="Next page" className="icon-button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={18} /></button></div>
        <div className="flex gap-1"><button aria-label="Zoom out" className="icon-button" onClick={() => setScale((s) => Math.max(0.65, s - 0.1))}><ZoomOut size={17} /></button><button aria-label="Zoom in" className="icon-button" onClick={() => setScale((s) => Math.min(2, s + 0.1))}><ZoomIn size={17} /></button></div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {showCue && (
          <aside className="sticky top-0 z-20 mx-auto mb-4 max-w-2xl rounded-2xl border border-coral/30 bg-[#fff8ed]/95 p-4 shadow-soft backdrop-blur" aria-live="polite">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-coral/15 text-coral"><Eye size={17} /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-coral">{activeCue.action.replaceAll("_", " ")}{activeCue.page_number ? ` · Page ${activeCue.page_number}` : ""}</p>
                <p className="mt-1 text-sm leading-6 text-ink">{activeCue.quote_to_highlight ? `Look for: “${activeCue.quote_to_highlight}”` : activeCue.narration_text}</p>
              </div>
            </div>
          </aside>
        )}
        <Document file={url} onLoadSuccess={({ numPages }) => setPages(numPages)} loading={<Loader2 className="mx-auto mt-16 animate-spin text-moss" />} error={<p className="mt-16 text-center text-red-700">The private PDF link expired or could not be opened. Refresh the page.</p>}><Page pageNumber={page} scale={scale} className="mx-auto w-fit overflow-hidden rounded shadow-soft" /></Document>
      </div>
    </div>
  );
}
