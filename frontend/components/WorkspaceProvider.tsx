"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, Square } from "lucide-react";
import { api } from "@/lib/api";
import type { AIOutput, AIOutputVersion, ChatMessage, ConceptGuide, DocumentStructure, MethodWalkthrough, PodcastScript, ReadingRoute, SectionIntro, SectionItem } from "@/lib/types";

type PlaybackStatus = "idle" | "playing" | "paused" | "complete";

export interface DocumentWorkspaceState {
  documentTitle: string;
  currentPage: number;
  readingRoute: ReadingRoute | null;
  podcast: PodcastScript | null;
  cueIndex: number;
  transcript: string;
  chatHistory: ChatMessage[];
  selectedSection: SectionItem | null;
  sectionIntros: Record<string, SectionIntro>;
  chapterMap: DocumentStructure | null;
  methodWalkthrough: MethodWalkthrough | null;
  conceptGuide: ConceptGuide | null;
  outputs: AIOutput[];
  versions: AIOutputVersion[];
}

interface WorkspaceContextValue {
  workspaces: Record<string, DocumentWorkspaceState>;
  selectedDocumentId: string | null;
  playbackStatus: PlaybackStatus;
  speechAvailable: boolean;
  selectDocument: (id: string, title: string) => void;
  updateWorkspace: (id: string, patch: Partial<DocumentWorkspaceState>) => void;
  startPlayback: (id: string, index?: number) => void;
  pausePlayback: () => void;
  resumePlayback: () => void;
  stopPlayback: () => void;
  moveCue: (delta: number) => void;
}

const emptyWorkspace = (title = ""): DocumentWorkspaceState => ({
  documentTitle: title,
  currentPage: 1,
  readingRoute: null,
  podcast: null,
  cueIndex: 0,
  transcript: "",
  chatHistory: [],
  selectedSection: null,
  sectionIntros: {},
  chapterMap: null,
  methodWalkthrough: null,
  conceptGuide: null,
  outputs: [],
  versions: [],
});

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY = "paperguide-workspaces-v2";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Record<string, DocumentWorkspaceState>>({});
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const [speechAvailable, setSpeechAvailable] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const workspacesRef = useRef(workspaces);
  const selectedRef = useRef<string | null>(null);
  const statusRef = useRef<PlaybackStatus>("idle");
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakRef = useRef<(id: string, index: number) => void>(() => undefined);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restoredWorkspaces = parsed.workspaces ?? parsed;
        const restoredSelected = parsed.selectedDocumentId ?? null;
        setWorkspaces(restoredWorkspaces);
        setSelectedDocumentId(restoredSelected);
        selectedRef.current = restoredSelected;
      } catch { window.localStorage.removeItem(STORAGE_KEY); }
    }
    setSpeechAvailable("speechSynthesis" in window && "SpeechSynthesisUtterance" in window);
    setHydrated(true);
  }, []);

  useEffect(() => {
    workspacesRef.current = workspaces;
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ workspaces, selectedDocumentId }));
  }, [hydrated, selectedDocumentId, workspaces]);

  const setStatus = useCallback((status: PlaybackStatus) => {
    statusRef.current = status;
    setPlaybackStatus(status);
  }, []);

  const updateWorkspace = useCallback((id: string, patch: Partial<DocumentWorkspaceState>) => {
    setWorkspaces((current) => ({ ...current, [id]: { ...(current[id] ?? emptyWorkspace()), ...patch } }));
  }, []);

  const selectDocument = useCallback((id: string, title: string) => {
    selectedRef.current = id;
    setSelectedDocumentId(id);
    setWorkspaces((current) => ({ ...current, [id]: { ...(current[id] ?? emptyWorkspace(title)), documentTitle: title } }));
  }, []);

  const speak = useCallback((id: string, index: number) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setSpeechAvailable(false);
      return;
    }
    const workspace = workspacesRef.current[id];
    const cue = workspace?.podcast?.cues[index];
    if (!cue) { setStatus("complete"); return; }
    utteranceRef.current = null;
    window.speechSynthesis.cancel();
    selectedRef.current = id;
    setSelectedDocumentId(id);
    updateWorkspace(id, { cueIndex: index, currentPage: cue.page_number ?? workspace.currentPage });
    setStatus("playing");
    const utterance = new SpeechSynthesisUtterance(cue.narration_text);
    utterance.rate = 0.96;
    utteranceRef.current = utterance;
    utterance.onend = () => {
      if (utteranceRef.current !== utterance || statusRef.current !== "playing") return;
      utteranceRef.current = null;
      const next = index + 1;
      if (next < (workspacesRef.current[id]?.podcast?.cues.length ?? 0)) speakRef.current(id, next);
      else setStatus("complete");
    };
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance || event.error === "canceled" || event.error === "interrupted") return;
      utteranceRef.current = null;
      setStatus("paused");
    };
    window.speechSynthesis.speak(utterance);
  }, [setStatus, updateWorkspace]);

  useEffect(() => { speakRef.current = speak; }, [speak]);

  const startPlayback = useCallback((id: string, index?: number) => {
    const workspace = workspacesRef.current[id];
    const start = index ?? (statusRef.current === "complete" ? 0 : workspace?.cueIndex ?? 0);
    void api.track("guided_reading_started", `/document/${id}`, { cue_index: start }).catch(() => undefined);
    speakRef.current(id, start);
  }, []);

  const pausePlayback = useCallback(() => {
    if (statusRef.current !== "playing" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, [setStatus]);

  const resumePlayback = useCallback(() => {
    const id = selectedRef.current;
    if (!id) return;
    if (utteranceRef.current && "speechSynthesis" in window) {
      window.speechSynthesis.resume();
      setStatus("playing");
    } else {
      speakRef.current(id, workspacesRef.current[id]?.cueIndex ?? 0);
    }
  }, [setStatus]);

  const stopPlayback = useCallback(() => {
    utteranceRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const id = selectedRef.current;
    if (id) updateWorkspace(id, { cueIndex: 0 });
    setStatus("idle");
  }, [setStatus, updateWorkspace]);

  const moveCue = useCallback((delta: number) => {
    const id = selectedRef.current;
    if (!id) return;
    const workspace = workspacesRef.current[id];
    const count = workspace?.podcast?.cues.length ?? 0;
    if (!count) return;
    const next = Math.min(Math.max((workspace.cueIndex ?? 0) + delta, 0), count - 1);
    const wasPlaying = statusRef.current === "playing";
    utteranceRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const cue = workspace.podcast!.cues[next];
    updateWorkspace(id, { cueIndex: next, currentPage: cue.page_number ?? workspace.currentPage });
    if (wasPlaying) speakRef.current(id, next);
  }, [updateWorkspace]);

  const value = useMemo(() => ({ workspaces, selectedDocumentId, playbackStatus, speechAvailable, selectDocument, updateWorkspace, startPlayback, pausePlayback, resumePlayback, stopPlayback, moveCue }), [workspaces, selectedDocumentId, playbackStatus, speechAvailable, selectDocument, updateWorkspace, startPlayback, pausePlayback, resumePlayback, stopPlayback, moveCue]);
  const active = selectedDocumentId ? workspaces[selectedDocumentId] : null;
  const cue = active?.podcast?.cues[active.cueIndex] ?? null;

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {active?.podcast && cue && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-4xl items-center gap-3 rounded-2xl border border-white/10 bg-ink px-4 py-3 text-white shadow-2xl sm:inset-x-6">
          <div className="min-w-0 flex-1"><p className="truncate text-xs text-white/50">{active.documentTitle}</p><p className="truncate text-sm font-medium">{cue.cue_title} {cue.page_number ? `· p. ${cue.page_number}` : ""}</p></div>
          <button className="icon-button !text-white" aria-label="Previous cue" onClick={() => moveCue(-1)}><SkipBack size={17} /></button>
          {playbackStatus === "playing" ? <button className="grid size-10 place-items-center rounded-full bg-white text-ink" aria-label="Pause" onClick={pausePlayback}><Pause size={18} /></button> : <button className="grid size-10 place-items-center rounded-full bg-white text-ink" aria-label="Play or resume" onClick={() => playbackStatus === "paused" ? resumePlayback() : startPlayback(selectedDocumentId!)}><Play size={18} /></button>}
          <button className="icon-button !text-white" aria-label="Next cue" onClick={() => moveCue(1)}><SkipForward size={17} /></button>
          <button className="icon-button !text-white" aria-label="Stop" onClick={stopPlayback}><Square size={15} /></button>
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return value;
}
