"use client";

import Link from "next/link";
import { FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { SampleDocumentButton } from "@/components/SampleDocumentButton";
import { UploadPanel } from "@/components/UploadPanel";
import { api } from "@/lib/api";
import type { DocumentRecord } from "@/lib/types";

export default function DashboardPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const loadDocuments = useCallback(async () => { try { setDocuments(await api.getDocuments()); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Could not load documents."); } finally { setLoading(false); } }, []);
  useEffect(() => { void loadDocuments(); void api.track("page_view", "/dashboard", { area: "library" }).catch(() => undefined); }, [loadDocuments]);
  return <main className="min-h-screen bg-paper pb-24"><Navbar /><div className="mx-auto max-w-6xl px-6 py-12 lg:px-10"><div className="mb-10 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow w-fit">Public learning desk</p><h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink">Choose a document to explore.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-ink/55">Try the attributed public sample or upload a non-sensitive PDF within the free-demo limits.</p></div><SampleDocumentButton compact /></div><div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]"><UploadPanel onUploaded={loadDocuments} /><section className="card p-7"><div className="flex items-end justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-ink/45">Available documents</p><h2 className="mt-2 text-2xl font-semibold">Reading desk</h2></div><span className="text-sm text-ink/45">{documents.length} documents</span></div>{loading ? <Loader2 className="mx-auto mt-16 animate-spin text-moss" /> : error ? <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : documents.length === 0 ? <div className="mt-10 rounded-2xl border border-dashed border-ink/20 p-10 text-center text-ink/50">Try the sample or upload your first PDF.</div> : <div className="mt-6 divide-y divide-ink/10">{documents.map((doc) => <Link href={`/document/${doc.id}`} key={doc.id} className="group flex items-center gap-4 py-4"><span className="grid size-12 place-items-center rounded-xl bg-sage text-moss"><FileText size={21} /></span><span className="min-w-0 flex-1"><span className="block truncate font-medium group-hover:text-moss">{doc.title}</span><span className="mt-1 block text-sm text-ink/45">{doc.page_count ?? "—"} pages · {doc.is_sample ? "Public sample · NIST" : doc.status}</span></span><span className="text-ink/30 transition group-hover:translate-x-1">→</span></Link>)}</div>}</section></div><p className="mt-8 text-center text-xs leading-5 text-ink/45">Free educational demo. Do not upload confidential, private, copyrighted, or sensitive documents. AI outputs may contain mistakes.</p></div></main>;
}
