"use client";

import { useState } from "react";
import { Loader2, Map } from "lucide-react";
import { api } from "@/lib/api";
import type { ReadingRoute } from "@/lib/types";
import { useWorkspace } from "./WorkspaceProvider";
import { UpdateResponseBox } from "./UpdateResponseBox";

export function ReadingRoutePanel({ documentId }: { documentId: string }) {
  const { workspaces, updateWorkspace } = useWorkspace();
  const route = workspaces[documentId]?.readingRoute ?? null;
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function generate() { setLoading(true); setError(""); try { updateWorkspace(documentId, { readingRoute: await api.generateReadingRoute(documentId) }); } catch (e) { setError(e instanceof Error ? e.message : "Generation failed."); } finally { setLoading(false); } }
  if (!route) return <EmptyTool icon={<Map />} title="Build a deliberate route" description="See what to read closely, what to skim, and which figures deserve attention." action="Generate Reading Route" loading={loading} error={error} onClick={generate} />;
  return <div><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.16em] text-ink/40">Overall goal</p><p className="mt-2 text-lg leading-7">{route.overall_goal}</p></div><button className="secondary-button !px-3 !py-2" onClick={generate} disabled={loading}>Regenerate</button></div><div className="mt-7 space-y-4">{route.recommended_reading_order.map((item, index) => <article className="rounded-2xl border border-ink/10 p-5" key={`${item.section_title}-${index}`}><div className="flex items-center justify-between gap-3"><span className={`priority ${item.priority.toLowerCase().replace(" ", "-")}`}>{item.priority}</span><button className="text-sm text-moss" onClick={() => item.page_start && updateWorkspace(documentId, { currentPage: item.page_start })}>p. {item.page_start ?? "?"}{item.page_end && item.page_end !== item.page_start ? `–${item.page_end}` : ""}</button></div><h3 className="mt-3 font-semibold">{item.section_title}</h3><p className="mt-2 text-sm leading-6 text-ink/60">{item.why_it_matters}</p>{item.what_to_extract.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink/55">{item.what_to_extract.map((x) => <li key={x}>{x}</li>)}</ul>}</article>)}</div><UpdateResponseBox documentId={documentId} responseType="reading_route" original={route} onUpdated={(value) => updateWorkspace(documentId, { readingRoute: value as ReadingRoute })} /></div>;
}

export function EmptyTool({ icon, title, description, action, loading, error, onClick }: { icon: React.ReactNode; title: string; description: string; action: string; loading: boolean; error: string; onClick: () => void }) {
  return <div className="flex min-h-[320px] flex-col items-center justify-center text-center"><span className="grid size-16 place-items-center rounded-2xl bg-sage text-moss">{icon}</span><h2 className="mt-5 text-2xl font-semibold">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-ink/50">{description}</p><button className="primary-button mt-6 inline-flex" onClick={onClick} disabled={loading}>{loading && <Loader2 size={17} className="animate-spin" />}{loading ? "Working through the pages…" : action}</button>{error && <p className="mt-4 max-w-md text-sm text-red-700">{error}</p>}</div>;
}
