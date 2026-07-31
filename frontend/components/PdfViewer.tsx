"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfViewer({ url }: { url: string }) {
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.05);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink/10 bg-white/80 px-4 backdrop-blur">
        <div className="flex items-center gap-1"><button aria-label="Previous page" className="icon-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={18} /></button><span className="min-w-20 text-center text-sm text-ink/60">{page} / {pages || "—"}</span><button aria-label="Next page" className="icon-button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}><ChevronRight size={18} /></button></div>
        <div className="flex gap-1"><button aria-label="Zoom out" className="icon-button" onClick={() => setScale((s) => Math.max(0.65, s - 0.1))}><ZoomOut size={17} /></button><button aria-label="Zoom in" className="icon-button" onClick={() => setScale((s) => Math.min(2, s + 0.1))}><ZoomIn size={17} /></button></div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5"><Document file={url} onLoadSuccess={({ numPages }) => setPages(numPages)} loading={<Loader2 className="mx-auto mt-16 animate-spin text-moss" />} error={<p className="mt-16 text-center text-red-700">The private PDF link expired or could not be opened. Refresh the page.</p>}><Page pageNumber={page} scale={scale} className="mx-auto w-fit overflow-hidden rounded shadow-soft" /></Document></div>
    </div>
  );
}
