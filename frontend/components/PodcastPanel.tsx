"use client";

import { useState } from "react";
import { Headphones, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import type { PodcastScript } from "@/lib/types";
import { EmptyTool } from "./ReadingRoutePanel";

export function PodcastPanel({ documentId }: { documentId: string }) {
  const [podcast, setPodcast] = useState<PodcastScript | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [error, setError] = useState("");
  async function generate() { setLoading(true); setError(""); try { setPodcast(await api.generatePodcast(documentId)); } catch (e) { setError(e instanceof Error ? e.message : "Generation failed."); } finally { setLoading(false); } }
  async function audio() { if (!podcast) return; setAudioLoading(true); setError(""); try { setAudioUrl(await api.generateAudio(documentId, podcast.script)); } catch (e) { setError(e instanceof Error ? e.message : "Audio generation failed."); } finally { setAudioLoading(false); } }
  if (!podcast) return <EmptyTool icon={<Headphones />} title="Listen for the throughline" description="Generate a conversational tutor episode grounded in this document." action="Generate Podcast Script" loading={loading} error={error} onClick={generate} />;
  return <div><div className="rounded-2xl bg-ink p-6 text-white"><p className="text-xs uppercase tracking-[0.16em] text-white/45">Tutor episode · {podcast.duration_minutes} min</p><h2 className="mt-3 text-2xl font-semibold">{podcast.episode_title}</h2><button className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50" onClick={audio} disabled={audioLoading}><Volume2 size={17} />{audioLoading ? "Generating audio…" : "Generate Audio"}</button>{audioUrl && <audio className="mt-5 w-full" controls src={audioUrl}>Your browser does not support audio.</audio>}</div>{error && <p className="mt-4 text-sm text-red-700">{error}</p>}<div className="mt-6 whitespace-pre-wrap text-[15px] leading-7 text-ink/70">{podcast.script}</div></div>;
}

