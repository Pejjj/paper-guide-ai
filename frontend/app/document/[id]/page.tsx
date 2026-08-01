"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AskDocumentBox } from "@/components/AskDocumentBox";
import { Navbar } from "@/components/Navbar";
import { NotesPanel } from "@/components/NotesPanel";
import { PdfViewer } from "@/components/PdfViewer";
import { PodcastPanel } from "@/components/PodcastPanel";
import { ReadingRoutePanel } from "@/components/ReadingRoutePanel";
import { api } from "@/lib/api";
import type { DocumentRecord, PodcastCue } from "@/lib/types";

const tabs = ["Reading Route", "Podcast", "Ask Document", "Notes"] as const;
type Tab = (typeof tabs)[number];

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Reading Route");
  const [activeCue, setActiveCue] = useState<PodcastCue | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getDocument(id).then(setDocument).catch((e) => setError(e instanceof Error ? e.message : "Document unavailable."));
  }, [id]);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-paper">
      <Navbar compact />
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(430px,0.92fr)]">
        <section className="min-h-[48vh] border-r border-ink/10 bg-[#e9e6df] lg:min-h-0">
          {document?.signed_url ? <PdfViewer url={document.signed_url} activeCue={activeCue} /> : <div className="grid h-full place-items-center p-8 text-center text-ink/45">{error || "Opening your PDF…"}</div>}
        </section>
        <section className="flex min-h-0 flex-col bg-white">
          <header className="border-b border-ink/10 px-6 py-5"><p className="truncate text-lg font-semibold text-ink">{document?.title ?? "Loading document…"}</p><p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/40">AI reading guide</p></header>
          <nav className="flex overflow-x-auto border-b border-ink/10 px-4" aria-label="Document tools">
            {tabs.map((tab) => <button key={tab} onClick={() => setActiveTab(tab)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${activeTab === tab ? "border-coral text-ink" : "border-transparent text-ink/45 hover:text-ink"}`}>{tab}</button>)}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {activeTab === "Reading Route" && <ReadingRoutePanel documentId={id} />}
            {activeTab === "Podcast" && <PodcastPanel documentId={id} onCueChange={setActiveCue} />}
            {activeTab === "Ask Document" && <AskDocumentBox documentId={id} />}
            {activeTab === "Notes" && <NotesPanel documentId={id} />}
          </div>
        </section>
      </div>
    </main>
  );
}
