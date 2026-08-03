"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { api } from "@/lib/api";
import type { CueAction, PodcastScript } from "@/lib/types";
import { useWorkspace } from "./WorkspaceProvider";
import { EmptyTool } from "./ReadingRoutePanel";
import { UpdateResponseBox } from "./UpdateResponseBox";

const actionLabels: Record<CueAction, string> = {
  scroll: "Follow the page", highlight: "Focus on this passage", pause: "Pause and reflect",
  inspect_table: "Inspect the table", inspect_figure: "Inspect the figure", inspect_formula: "Inspect the formula",
  compare_pages: "Compare pages", checkpoint_question: "Checkpoint question",
};

export function PodcastPanel({ documentId }: { documentId: string }) {
  const { workspaces, updateWorkspace, playbackStatus, speechAvailable, startPlayback, pausePlayback, resumePlayback, stopPlayback, moveCue } = useWorkspace();
  const workspace = workspaces[documentId];
  const podcast = workspace?.podcast ?? null;
  const cueIndex = workspace?.cueIndex ?? 0;
  const [mode, setMode] = useState("normal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const handledRequest = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function generate(request = workspace?.guidedReadingRequest) {
    setLoading(true); setError("");
    setStage("Preparing selected pages");
    const section = workspace?.selectedSection;
    const start = request?.page_start ?? workspace?.selectedScope?.page_start ?? section?.page_start;
    const end = request?.page_end ?? workspace?.selectedScope?.page_end ?? section?.page_end ?? start;
    if (start && end && end - start + 1 > 40) {
      setLoading(false); setStage(""); setError("This range is large. Choose a section of 40 pages or fewer, or generate a chapter overview."); return;
    }
    const controller = new AbortController();
    abortRef.current?.abort(); abortRef.current = controller;
    const timers = [
      window.setTimeout(() => setStage(start && end && end - start + 1 > 8 ? "Chunking section" : "Building guided reading cues"), 700),
      window.setTimeout(() => setStage("Summarizing chunks"), 2200),
      window.setTimeout(() => setStage("Building guided reading cues"), 5000),
    ];
    try {
      const result = await api.generateGuidedReading(documentId, {
        scope_type: request?.scope_type ?? workspace?.selectedScope?.scope_type ?? (section ? "section" : "document"),
        page_start: start,
        page_end: end,
        section_id: request?.section_id ?? section?.section_id,
        chapter_id: request?.chapter_id,
        focus_text: request?.focus_text,
        learning_mode: request?.learning_mode ?? ({ simple: "simple_english", formulas: "formulas_only", exam: "exam_study" } as Record<string, string>)[mode] ?? mode,
      }, controller.signal);
      setStage("Saving result");
      updateWorkspace(documentId, { podcast: result, transcript: result.script, cueIndex: 0, currentPage: result.cues[0]?.page_number ?? workspace?.currentPage ?? 1, guidedReadingRequest: null });
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Generation failed."); }
    finally { timers.forEach(window.clearTimeout); if (abortRef.current === controller) abortRef.current = null; setLoading(false); setStage(""); }
  }

  function cancel() { abortRef.current?.abort(); abortRef.current = null; setLoading(false); setStage(""); updateWorkspace(documentId, { guidedReadingRequest: null }); }

  useEffect(() => {
    const request = workspace?.guidedReadingRequest;
    if (!request || handledRequest.current === request.request_id) return;
    handledRequest.current = request.request_id;
    void generate(request);
    // request_id is the intentional trigger; workspace changes while generation runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.guidedReadingRequest?.request_id]);

  if (!podcast) return <div><ModePicker mode={mode} setMode={setMode} />{loading ? <GenerationProgress stage={stage} onCancel={cancel} /> : <EmptyTool icon={<Headphones />} title="Listen, scroll, inspect, and check your understanding" description="Generate a guided walkthrough for the whole document or the selected learning scope." action="Generate Guided Reading" loading={false} error={error} onClick={generate} />}</div>;
  const cue = podcast.cues[cueIndex] ?? null;
  const progress = podcast.cues.length ? ((cueIndex + 1) / podcast.cues.length) * 100 : 0;

  return <div>
    {loading && <GenerationProgress stage={stage} onCancel={cancel} />}
    <div className="rounded-2xl bg-ink p-6 text-white">
      <p className="text-xs uppercase tracking-[0.16em] text-white/45">Guided document walkthrough · {podcast.duration_minutes} min</p>
      <h2 className="mt-3 text-2xl font-semibold">{podcast.episode_title}</h2>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-coral transition-all" style={{ width: `${progress}%` }} /></div>
      <div className="mt-2 flex justify-between text-xs text-white/55"><span>Cue {cueIndex + 1} of {podcast.cues.length}</span><span>{playbackStatus}</span></div>
      <div className="mt-5 flex flex-wrap gap-2">
        {playbackStatus === "playing" ? <button className="player-primary" onClick={pausePlayback}><Pause size={17} />Pause</button> : playbackStatus === "paused" ? <button className="player-primary" onClick={resumePlayback}><Play size={17} />Resume</button> : <button className="player-primary" onClick={() => startPlayback(documentId)} disabled={!speechAvailable}><Play size={17} />Start Guided Reading</button>}
        <button className="player-secondary" onClick={() => moveCue(-1)} disabled={cueIndex <= 0}><SkipBack size={16} />Previous</button>
        <button className="player-secondary" onClick={() => moveCue(1)} disabled={cueIndex >= podcast.cues.length - 1}><SkipForward size={16} />Next</button>
        <button className="player-secondary" onClick={stopPlayback}><Square size={15} />Stop</button>
      </div>
    </div>
    {!speechAvailable && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Browser speech is unavailable. The synchronized transcript and page directions still work.</p>}
    {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
    {cue && <section className="mt-5 rounded-2xl border border-moss/15 bg-sage/45 p-5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-moss"><span>{actionLabels[cue.action]}</span>{cue.page_number && <span>· Page {cue.page_number}</span>}<span className="ml-auto rounded-full bg-white/70 px-2.5 py-1 normal-case tracking-normal">{cue.importance} priority</span></div>
      <h3 className="mt-3 font-semibold text-ink">{cue.cue_title}</h3><p className="mt-2 text-base leading-7 text-ink">{cue.narration_text}</p>
      {cue.quote_to_highlight && <blockquote className="mt-4 border-l-2 border-coral pl-3 text-sm italic leading-6 text-ink/60">“{cue.quote_to_highlight}”</blockquote>}
    </section>}
    <UpdateResponseBox documentId={documentId} responseType="guided_reading" original={podcast} onUpdated={(updated) => updateWorkspace(documentId, { podcast: updated as PodcastScript, transcript: (updated as PodcastScript).script })} />
    <section className="mt-7 border-t border-ink/10 pt-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">Full episode transcript</p><div className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-ink/70">{podcast.script}</div></section>
  </div>;
}

function GenerationProgress({ stage, onCancel }: { stage: string; onCancel: () => void }) { return <div className="mb-4 flex items-center gap-3 rounded-2xl border border-moss/15 bg-sage/50 p-4"><LoaderSpinner /><div className="flex-1"><p className="text-sm font-semibold text-moss">{stage}</p><p className="mt-1 text-xs text-ink/45">Long sections are summarized in page chunks before cues are assembled.</p></div><button className="text-xs font-medium text-ink/50" onClick={onCancel}>Cancel</button></div>; }
function LoaderSpinner() { return <span className="size-5 animate-spin rounded-full border-2 border-moss/25 border-t-moss" aria-hidden="true" />; }

function ModePicker({ mode, setMode }: { mode: string; setMode: (value: string) => void }) {
  return <div className="mb-4"><label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45" htmlFor="walkthrough-mode">Walkthrough style</label><select id="walkthrough-mode" className="field mt-2" value={mode} onChange={(event) => setMode(event.target.value)}><option value="normal">Normal walkthrough</option><option value="simple">Simple English</option><option value="technical">Technical</option><option value="formulas">Formulas only</option><option value="exam">Exam / study mode</option></select></div>;
}
