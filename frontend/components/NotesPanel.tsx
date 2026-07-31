"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Save } from "lucide-react";
import { api } from "@/lib/api";
import type { Note } from "@/lib/types";

export function NotesPanel({ documentId }: { documentId: string }) {
  const [notes, setNotes] = useState<Note[]>([]); const [content, setContent] = useState(""); const [page, setPage] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const refresh = useCallback(async () => { try { setNotes(await api.getNotes(documentId)); } catch (e) { setError(e instanceof Error ? e.message : "Could not load notes."); } }, [documentId]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function save() { if (!content.trim()) return; setLoading(true); setError(""); try { await api.saveNote(documentId, content, page ? Number(page) : null); setContent(""); setPage(""); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save note."); } finally { setLoading(false); } }
  async function exportNotes() { try { const blob = await api.exportNotes(documentId); const url = URL.createObjectURL(blob); const a = window.document.createElement("a"); a.href = url; a.download = "paper-guide-notes.md"; a.click(); URL.revokeObjectURL(url); } catch (e) { setError(e instanceof Error ? e.message : "Export failed."); } }
  return <div><div className="grid gap-3 sm:grid-cols-[1fr_100px]"><textarea className="field min-h-28" placeholder="Capture a claim, connection, or literature review idea…" value={content} onChange={(e) => setContent(e.target.value)} /><input className="field h-fit" type="number" min="1" placeholder="Page" value={page} onChange={(e) => setPage(e.target.value)} /></div><div className="mt-3 flex flex-wrap gap-2"><button className="primary-button" onClick={save} disabled={loading || !content.trim()}>{loading ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}Save Note</button><button className="secondary-button" onClick={exportNotes}><Download size={17} />Export Notes</button></div>{error && <p className="mt-4 text-sm text-red-700">{error}</p>}<div className="mt-7 space-y-3">{notes.map((note) => <article className="rounded-2xl border border-ink/10 p-5" key={note.id}><div className="flex justify-between text-xs uppercase tracking-[0.12em] text-ink/35"><span>{note.page_number ? `Page ${note.page_number}` : "General note"}</span><span>{new Date(note.created_at).toLocaleDateString()}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/70">{note.content}</p></article>)}</div></div>;
}
