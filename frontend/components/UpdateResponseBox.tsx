"use client";

import { useState } from "react";
import { Loader2, MessageSquareMore } from "lucide-react";
import { api } from "@/lib/api";
import { useWorkspace } from "./WorkspaceProvider";

export function UpdateResponseBox({ documentId, responseType, original, onUpdated, currentContext = {} }: { documentId: string; responseType: string; original: unknown; onUpdated: (value: unknown) => void; currentContext?: Record<string, unknown> }) {
  const { workspaces, updateWorkspace } = useWorkspace();
  const [open, setOpen] = useState(false); const [instruction, setInstruction] = useState(""); const [loading, setLoading] = useState(false); const [message, setMessage] = useState("");
  const output = workspaces[documentId]?.outputs.find((item) => item.output_type === responseType);
  async function submit() {
    if (!instruction.trim()) return;
    setLoading(true); setMessage("");
    try {
      const result = await api.updateResponse(documentId, responseType, original, instruction, currentContext, output?.id);
      onUpdated(result.updated_response);
      setMessage(`Updated using: “${result.user_instruction}” · version ${result.version_number}`);
      const history = await api.getAIOutputs(documentId);
      updateWorkspace(documentId, { outputs: history.outputs, versions: history.versions });
      setInstruction("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Update failed."); }
    finally { setLoading(false); }
  }
  return <div className="mt-5 rounded-2xl border border-ink/10 p-4"><button className="flex items-center gap-2 text-sm font-semibold text-moss" onClick={() => setOpen(!open)}><MessageSquareMore size={17} />Update with instruction</button>{open && <div className="mt-3"><textarea className="field min-h-24" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Make it simpler, focus on formulas, or add page references…" /><div className="mt-2 flex flex-wrap gap-2">{["Make it simpler", "Explain step by step", "Focus on formulas", "Make it more technical"].map((text) => <button key={text} className="rounded-full bg-ink/5 px-3 py-1.5 text-xs text-ink/65" onClick={() => setInstruction(text)}>{text}</button>)}</div><button className="primary-button mt-3 inline-flex" onClick={submit} disabled={loading || !instruction.trim()}>{loading && <Loader2 size={16} className="animate-spin" />}Apply update</button>{message && <p className="mt-3 text-sm text-ink/60">{message}</p>}</div>}</div>;
}
