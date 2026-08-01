"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { api } from "@/lib/api";
import type { PodcastCue, PodcastScript } from "@/lib/types";
import { EmptyTool } from "./ReadingRoutePanel";

type PlaybackState = "idle" | "playing" | "paused" | "complete";

interface PodcastPanelProps {
  documentId: string;
  onCueChange: (cue: PodcastCue | null) => void;
}

const actionLabels: Record<PodcastCue["action"], string> = {
  scroll: "Follow the page",
  highlight: "Focus on this passage",
  pause: "Pause and reflect",
  inspect_table: "Inspect the table",
  inspect_figure: "Inspect the figure",
};

export function PodcastPanel({ documentId, onCueChange }: PodcastPanelProps) {
  const [podcast, setPodcast] = useState<PodcastScript | null>(null);
  const [cueIndex, setCueIndex] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cuesRef = useRef<PodcastCue[]>([]);
  const cueIndexRef = useRef(0);
  const playbackStateRef = useRef<PlaybackState>("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakCueRef = useRef<(index: number) => void>(() => undefined);

  const setState = useCallback((state: PlaybackState) => {
    playbackStateRef.current = state;
    setPlaybackState(state);
  }, []);

  const cancelSpeech = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const showCue = useCallback((index: number) => {
    const cue = cuesRef.current[index];
    if (!cue) return;
    cueIndexRef.current = index;
    setCueIndex(index);
    onCueChange(cue);
  }, [onCueChange]);

  const speakCue = useCallback((index: number) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setSpeechAvailable(false);
      setError("Browser speech is unavailable. You can still follow the cue transcript and PDF directions.");
      return;
    }

    const cue = cuesRef.current[index];
    if (!cue) {
      utteranceRef.current = null;
      setState("complete");
      return;
    }

    cancelSpeech();
    showCue(index);
    setState("playing");

    const utterance = new SpeechSynthesisUtterance(cue.narration_text);
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utteranceRef.current = utterance;
    utterance.onend = () => {
      if (utteranceRef.current !== utterance || playbackStateRef.current !== "playing") return;
      utteranceRef.current = null;
      if (index + 1 < cuesRef.current.length) {
        speakCueRef.current(index + 1);
      } else {
        setState("complete");
      }
    };
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance || event.error === "canceled" || event.error === "interrupted") return;
      utteranceRef.current = null;
      setState("idle");
      setError(`Narration stopped: ${event.error}. You can continue with the cue transcript.`);
    };
    window.speechSynthesis.speak(utterance);
  }, [cancelSpeech, setState, showCue]);

  useEffect(() => {
    speakCueRef.current = speakCue;
  }, [speakCue]);

  useEffect(() => {
    const available = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    setSpeechAvailable(available);
    return () => {
      playbackStateRef.current = "idle";
      utteranceRef.current = null;
      if (available) cancelSpeech();
      onCueChange(null);
    };
  }, [cancelSpeech, onCueChange]);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      if (speechAvailable) cancelSpeech();
      const result = await api.generatePodcast(documentId);
      const normalized = { ...result, cues: result.cues ?? [] };
      setPodcast(normalized);
      cuesRef.current = normalized.cues;
      cueIndexRef.current = 0;
      setCueIndex(0);
      setState("idle");
      onCueChange(normalized.cues[0] ?? null);
      if (!normalized.cues.length) {
        setError("The episode was created without synchronized cues. Regenerate it to use guided playback.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  function start() {
    setError("");
    const startIndex = playbackStateRef.current === "complete" ? 0 : cueIndexRef.current;
    speakCueRef.current(startIndex);
  }

  function pause() {
    if (playbackStateRef.current !== "playing") return;
    window.speechSynthesis.pause();
    setState("paused");
  }

  function resume() {
    if (playbackStateRef.current !== "paused") return;
    if (utteranceRef.current) {
      window.speechSynthesis.resume();
      setState("playing");
    } else {
      speakCueRef.current(cueIndexRef.current);
    }
  }

  function stop() {
    utteranceRef.current = null;
    cancelSpeech();
    cueIndexRef.current = 0;
    setCueIndex(0);
    setState("idle");
    onCueChange(null);
  }

  function moveCue(delta: number) {
    const next = Math.min(Math.max(cueIndexRef.current + delta, 0), cuesRef.current.length - 1);
    if (next === cueIndexRef.current || next < 0) return;
    const keepPlaying = playbackStateRef.current === "playing";
    utteranceRef.current = null;
    cancelSpeech();
    showCue(next);
    if (keepPlaying) speakCueRef.current(next);
  }

  if (!podcast) {
    return <EmptyTool icon={<Headphones />} title="Listen, scroll, and inspect" description="Generate a guided walkthrough that narrates the paper and moves through its key pages." action="Generate Guided Reading" loading={loading} error={error} onClick={generate} />;
  }

  const cue = podcast.cues[cueIndex] ?? null;
  const progress = podcast.cues.length ? ((cueIndex + 1) / podcast.cues.length) * 100 : 0;
  const canNarrate = speechAvailable === true && podcast.cues.length > 0;

  return (
    <div>
      <div className="rounded-2xl bg-ink p-6 text-white">
        <p className="text-xs uppercase tracking-[0.16em] text-white/45">Guided document walkthrough · {podcast.duration_minutes} min</p>
        <h2 className="mt-3 text-2xl font-semibold">{podcast.episode_title}</h2>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15" aria-label={`Cue ${cueIndex + 1} of ${podcast.cues.length}`}>
          <div className="h-full rounded-full bg-coral transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-white/55">
          <span>{podcast.cues.length ? `Cue ${cueIndex + 1} of ${podcast.cues.length}` : "No synchronized cues"}</span>
          <span>{playbackState === "complete" ? "Walkthrough complete" : playbackState}</span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {playbackState === "paused" ? (
            <button className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50" onClick={resume} disabled={!canNarrate}><Play size={17} />Resume</button>
          ) : playbackState === "playing" ? (
            <button className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink" onClick={pause}><Pause size={17} />Pause</button>
          ) : (
            <button className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50" onClick={start} disabled={!canNarrate}><Play size={17} />Start Guided Reading</button>
          )}
          <button className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40" onClick={() => moveCue(-1)} disabled={cueIndex <= 0}><SkipBack size={16} />Previous</button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40" onClick={() => moveCue(1)} disabled={cueIndex >= podcast.cues.length - 1}><SkipForward size={16} />Next</button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40" onClick={stop} disabled={playbackState === "idle"}><Square size={15} />Stop</button>
        </div>
      </div>

      {speechAvailable === false && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Browser speech is unavailable here. The synchronized transcript and PDF directions still work; try a current version of Chrome, Edge, or Safari for narration.</p>}
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

      {cue && (
        <section className="mt-5 rounded-2xl border border-moss/15 bg-sage/45 p-5" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-moss">
            <span>{actionLabels[cue.action]}</span>
            {cue.page_number && <span>· Page {cue.page_number}</span>}
            <span className="ml-auto rounded-full bg-white/70 px-2.5 py-1 normal-case tracking-normal">{cue.importance} priority</span>
          </div>
          <p className="mt-3 text-base leading-7 text-ink">{cue.narration_text}</p>
          {cue.quote_to_highlight && <blockquote className="mt-4 border-l-2 border-coral pl-3 text-sm italic leading-6 text-ink/60">“{cue.quote_to_highlight}”</blockquote>}
        </section>
      )}

      <section className="mt-7 border-t border-ink/10 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/40">Full episode transcript</p>
        <div className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-ink/70">{podcast.script}</div>
      </section>
    </div>
  );
}
