"use client";

import { useState } from "react";
import { Loader2, Map } from "lucide-react";
import { api } from "@/lib/api";
import type { ReadingRoute } from "@/lib/types";

export function ReadingRoutePanel({ documentId }: { documentId: string }) {
  const [route, setRoute] = useState<ReadingRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function generate() { setLoading(true); setError(""); try { setRoute(await api.generateReadingRoute(documentId)); } catch (e) { setError(e instanceof Error ? e.message : "Generation failed."); } finally { setLoading(false); } }
  if (!route) return <EmptyTool icon={<Map />} title="Build a deliberate route" description="See what to read closely, what to skim, and which figures deserve your attention." action="Generate Reading Route" loading={loading} error={error} onClick={generate} />;
  return <div><p className="text-xs uppercase tracking-[0.16em] text-ink/40">Overall goal</p><p className="mt-2 text-lg leading-7">{route.overall_goal}</p><div className="mt-7 space-y-4">{route.recommended_reading_order.map((item, index) => <article className="rounded-2xl border border-ink/10 p-5" key={`${item.section_title}-${index}`}><div className="flex items-center justify-between gap-3"><span className={`priority ${item.priority.toLowerCase().replace(" ", "-")}`}>{item.priority}</span><span className="text-sm text-ink/40">p. {item.page_start ?? "?"}{item.page_end && item.page_end !== item.page_start ? `–${item.page_end}` : ""}</span></div><h3 className="mt-3 font-semibold">{item.section_title}</h3><p className="mt-2 text-sm leading-6 text-ink/60">{item.why_it_matters}</p>{item.what_to_extract.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink/55">{item.what_to_extract.map((x) => <li key={x}>{x}</li>)}</ul>}</article>)}</div></div>;
}

export function EmptyTool({ icon, title, description, action, loading, error, onClick }: { icon: React.ReactNode; title: string; description: string; action: string; loading: boolean; error: string; onClick: () => void }) {
  return <div className="flex min-h-[360px] flex-col items-center justify-center text-center"><span className="grid size-16 place-items-center rounded-2xl bg-sage text-moss">{icon}</span><h2 className="mt-5 text-2xl font-semibold">{title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-ink/50">{description}</p><button className="primary-button mt-6" onClick={onClick} disabled={loading}>{loading && <Loader2 size={17} className="animate-spin" />}{loading ? "Working through the pages…" : action}</button>{error && <p className="mt-4 max-w-md text-sm text-red-700">{error}</p>}</div>;
}

