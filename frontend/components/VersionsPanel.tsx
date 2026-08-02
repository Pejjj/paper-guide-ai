"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useWorkspace } from "./WorkspaceProvider";

export function VersionsPanel({ documentId }: { documentId: string }) {
  const { workspaces, updateWorkspace } = useWorkspace(); const workspace = workspaces[documentId];
  useEffect(() => { api.getAIOutputs(documentId).then(({ outputs, versions }) => updateWorkspace(documentId, { outputs, versions })).catch(() => undefined); }, [documentId, updateWorkspace]);
  async function revert(outputId: string, version: number, outputType: string) { const result = await api.revertOutput(outputId, version); const patch = outputType === "reading_route" ? { readingRoute: result.payload as never } : outputType === "guided_reading" ? { podcast: result.payload as never } : outputType === "chapter_map" ? { chapterMap: result.payload as never } : outputType === "section_intro" ? { sectionIntros: { ...workspace.sectionIntros, restored: result.payload as never } } : {}; updateWorkspace(documentId, patch); }
  if (!workspace?.outputs.length) return <div className="rounded-2xl border border-dashed border-ink/20 p-10 text-center text-ink/50">Generated and updated AI responses will appear here with version history.</div>;
  return <div className="space-y-5">{workspace.outputs.map((output) => { const versions = workspace.versions.filter((version) => version.ai_output_id === output.id); return <article key={output.id} className="rounded-2xl border border-ink/10 p-5"><div className="flex justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.14em] text-ink/40">{output.scope_type}</p><h3 className="mt-1 font-semibold">{output.output_type.replaceAll("_", " ")}</h3></div><span className="text-xs text-ink/40">{versions.length} version{versions.length === 1 ? "" : "s"}</span></div><div className="mt-4 space-y-2">{versions.map((version) => <div key={version.id} className="flex items-center gap-3 rounded-xl bg-paper p-3 text-sm"><span className="font-medium">v{version.version_number}</span><span className="min-w-0 flex-1 truncate text-ink/50">{version.instruction ? `Updated using: ${version.instruction}` : "Original generation"}</span><button className="flex items-center gap-1 text-xs font-semibold text-moss" onClick={() => revert(output.id, version.version_number, output.output_type)}><RotateCcw size={13} />Revert</button></div>)}</div></article>; })}</div>;
}
