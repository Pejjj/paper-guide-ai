"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AskDocumentBox } from "@/components/AskDocumentBox";
import { DocumentMapPanel } from "@/components/DocumentMapPanel";
import { Navbar } from "@/components/Navbar";
import { NotesPanel } from "@/components/NotesPanel";
import { PdfViewer } from "@/components/PdfViewer";
import { PodcastPanel } from "@/components/PodcastPanel";
import { ReadingRoutePanel } from "@/components/ReadingRoutePanel";
import { VersionsPanel } from "@/components/VersionsPanel";
import { useWorkspace } from "@/components/WorkspaceProvider";
import type { DocumentWorkspaceState } from "@/components/WorkspaceProvider";
import { api } from "@/lib/api";
import type { DocumentRecord, DocumentStructure, PodcastScript, ReadingRoute } from "@/lib/types";

const tabs = ["Overview", "Document Map", "Guided Reading", "Ask", "Notes", "Versions"] as const;
type Tab = (typeof tabs)[number];

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const { workspaces, selectDocument, updateWorkspace } = useWorkspace();
  const workspace = workspaces[id];
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [error, setError] = useState("");
  const setCurrentPage = useCallback((page: number) => updateWorkspace(id, { currentPage: page }), [id, updateWorkspace]);

  useEffect(() => {
    api.getDocument(id).then((result) => { setDocument(result); selectDocument(id, result.title); }).catch((e) => setError(e instanceof Error ? e.message : "Document unavailable."));
    void api.track("page_view", `/document/${id}`, { area: "workspace" }).catch(() => undefined);
    api.getAIOutputs(id).then(({ outputs, versions }) => {
      const latest = (type: string) => outputs.find((item) => item.output_type === type)?.payload;
      const patch: Partial<DocumentWorkspaceState> = { outputs, versions };
      if (latest("reading_route")) patch.readingRoute = latest("reading_route") as ReadingRoute;
      if (latest("guided_reading")) patch.podcast = latest("guided_reading") as PodcastScript;
      if (latest("chapter_map")) patch.chapterMap = latest("chapter_map") as DocumentStructure;
      updateWorkspace(id, patch);
    }).catch(() => undefined);
  }, [id, selectDocument, updateWorkspace]);

  const cue = workspace?.podcast?.cues[workspace.cueIndex] ?? null;

  return <main className="flex h-screen flex-col overflow-hidden bg-paper pb-20">
    <Navbar compact />
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1.06fr)_minmax(450px,0.94fr)]">
      <section className="min-h-[45vh] border-r border-ink/10 bg-[#e9e6df] lg:min-h-0">{document?.signed_url ? <PdfViewer url={document.signed_url} activeCue={cue} currentPage={workspace?.currentPage ?? 1} onPageChange={setCurrentPage} /> : <div className="grid h-full place-items-center p-8 text-center text-ink/45">{error || "Opening your PDF…"}</div>}</section>
      <section className="flex min-h-0 flex-col bg-white">
        <header className="border-b border-ink/10 px-6 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-lg font-semibold text-ink">{document?.title ?? "Loading document…"}</p><p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/40">{document?.is_sample ? "Public sample · read only" : "Private document workspace"}</p></div><span className="shrink-0 rounded-full bg-sage px-3 py-1 text-xs text-moss">{document?.page_count ?? "—"} pages</span></div></header>
        <nav className="flex overflow-x-auto border-b border-ink/10 px-3" aria-label="Document tools">{tabs.map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${activeTab === tab ? "border-coral text-ink" : "border-transparent text-ink/45 hover:text-ink"}`}>{tab}</button>)}</nav>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {activeTab === "Overview" && <Overview document={document} documentId={id} onStart={() => setActiveTab("Guided Reading")} />}
          {activeTab === "Document Map" && <DocumentMapPanel documentId={id} onOpenGuidedReading={() => setActiveTab("Guided Reading")} />}
          {activeTab === "Guided Reading" && <PodcastPanel documentId={id} />}
          {activeTab === "Ask" && <AskDocumentBox documentId={id} />}
          {activeTab === "Notes" && <NotesPanel documentId={id} />}
          {activeTab === "Versions" && <VersionsPanel documentId={id} />}
        </div>
      </section>
    </div>
  </main>;
}

function Overview({ document, documentId, onStart }: { document: DocumentRecord | null; documentId: string; onStart: () => void }) {
  return <div><section className="rounded-2xl bg-ink p-6 text-white"><p className="text-xs uppercase tracking-[0.16em] text-white/45">Document overview</p><h1 className="mt-2 text-2xl font-semibold">{document?.title}</h1><div className="mt-4 flex flex-wrap gap-3 text-sm text-white/60"><span>{document?.page_count ?? "—"} pages</span><span>·</span><span>{document?.status}</span>{document?.is_sample && <><span>·</span><a className="underline" href={document.source_url} target="_blank" rel="noreferrer">Source: NIST</a></>}</div><button className="mt-5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink" onClick={onStart}>Start guided reading</button></section><div className="mt-6"><ReadingRoutePanel documentId={documentId} /></div></div>;
}
