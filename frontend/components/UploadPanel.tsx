"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { FileUp, Loader2, Lock } from "lucide-react";
import { api } from "@/lib/api";

export function UploadPanel({ onUploaded }: { onUploaded: () => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf") { setError("Please choose a PDF file."); return; }
    setUploading(true); setError("");
    try { await api.uploadDocument(file); await onUploaded(); }
    catch (err) { setError(err instanceof Error ? err.message : "Upload failed."); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) { void upload(event.target.files?.[0]); }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); void upload(event.dataTransfer.files?.[0]); }

  return (
    <section className="card flex min-h-[360px] flex-col p-7">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-ink/45"><Lock size={13} /> Private upload</div>
      <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} className="mt-6 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-moss/35 bg-sage/40 p-8 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-white text-moss shadow-sm">{uploading ? <Loader2 className="animate-spin" /> : <FileUp />}</span>
        <h2 className="mt-5 text-xl font-semibold">Bring a difficult document</h2>
        <p className="mt-2 max-w-xs text-sm leading-6 text-ink/50">Drop a research paper, manual, or dissertation source here.</p>
        <input ref={inputRef} type="file" accept="application/pdf" onChange={onChange} className="sr-only" id="pdf-upload" />
        <button className="secondary-button mt-6" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? "Extracting pages…" : "Choose PDF"}</button>
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
      </div>
    </section>
  );
}

