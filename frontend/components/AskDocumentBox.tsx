"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useWorkspace } from "./WorkspaceProvider";
import { UpdateResponseBox } from "./UpdateResponseBox";

type AskScope = "document" | "page" | "chapter" | "section" | "page_range" | "concept" | "formula";
const suggestions = ["Explain this section simply", "What formulas matter here?", "What should I read first?", "Where is this concept defined?", "Make me a step-by-step study plan"];

export function AskDocumentBox({ documentId }: { documentId: string }) {
  const { workspaces, updateWorkspace } = useWorkspace();
  const workspace = workspaces[documentId];
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState<AskScope>(workspace?.selectedDefinition ? "concept" : workspace?.selectedScope ? "page_range" : "document");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const latestAnswer = [...(workspace?.chatHistory ?? [])].reverse().find((item) => item.role === "assistant");

  const selection = useMemo(() => {
    const selected = workspace?.selectedScope;
    const section = workspace?.selectedSection;
    const chapter = workspace?.chapterMap?.chapters.find((item) => item.chapter_id === selected?.scope_id || item.sections.some((part) => part.section_id === selected?.scope_id));
    const current = workspace?.currentPage ?? 1;
    if (scope === "page") return { scope_type: "page", page_start: current, page_end: current, label: `Current PDF page ${current}` };
    if (scope === "chapter" && chapter?.page_start) return { scope_type: "chapter", page_start: chapter.page_start, page_end: chapter.page_end, label: `${chapter.chapter_title} · PDF p. ${chapter.page_start}–${chapter.page_end ?? chapter.page_start}` };
    if ((scope === "section" || scope === "page_range") && selected?.page_start) return { scope_type: scope, page_start: selected.page_start, page_end: selected.page_end, label: `${selected.title} · PDF p. ${selected.page_start}–${selected.page_end ?? selected.page_start}` };
    if (scope === "concept" && workspace?.selectedDefinition) return { scope_type: "concept", page_start: selected?.page_start ?? workspace.selectedDefinition.page_defined, page_end: selected?.page_end ?? workspace.selectedDefinition.page_defined, label: `Concept: ${workspace.selectedDefinition.term}` };
    if (scope === "formula") return { scope_type: "formula", page_start: current, page_end: current, label: `Formula context on PDF page ${current}` };
    if (scope === "section" && section?.page_start) return { scope_type: "section", page_start: section.page_start, page_end: section.page_end, label: `${section.section_title} · PDF p. ${section.page_start}–${section.page_end ?? section.page_start}` };
    return { scope_type: "document", label: "Whole document" };
  }, [scope, workspace]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true); setError("");
    try {
      const result = await api.ask(documentId, question, selection);
      const now = new Date().toISOString();
      updateWorkspace(documentId, { chatHistory: [...(workspace?.chatHistory ?? []), { role: "user", content: question, createdAt: now }, { role: "assistant", content: result.answer, createdAt: new Date().toISOString() }] });
      setQuestion("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Question failed."); }
    finally { setLoading(false); }
  }

  return <div><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-sage text-moss"><MessageCircleQuestion /></span><div><h2 className="text-xl font-semibold">Ask the document</h2><p className="text-sm text-ink/45">Answers prioritize the selected scope and cite supported PDF pages.</p></div></div>
    <div className="mt-5"><label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/40" htmlFor="ask-scope">Answer scope</label><select id="ask-scope" className="field mt-2" value={scope} onChange={(event) => setScope(event.target.value as AskScope)}><option value="document">Whole document</option><option value="page">Current page</option><option value="chapter">Selected chapter</option><option value="section">Selected section</option><option value="page_range">Selected range</option><option value="concept">Selected concept</option><option value="formula">Selected formula / current formula page</option></select><p className="mt-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink/55">Selected scope: {selection.label}</p></div>
    <div className="mt-4 flex flex-wrap gap-2">{suggestions.map((value) => <button key={value} className="rounded-full border border-ink/10 px-3 py-1.5 text-xs text-moss" onClick={() => setQuestion(value)}>{value}</button>)}</div>
    <div className="mt-6 space-y-3">{workspace?.chatHistory?.map((message, index) => <article key={`${message.createdAt}-${index}`} className={`rounded-2xl p-4 text-sm leading-6 ${message.role === "user" ? "ml-8 bg-ink text-white" : "mr-8 border border-ink/10 bg-paper text-ink/75"}`}>{message.content}</article>)}</div>
    <form onSubmit={submit} className="mt-7"><textarea className="field min-h-28 resize-y" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about the selected scope…" /><button className="primary-button mt-3 inline-flex" disabled={loading || !question.trim()}>{loading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}{loading ? "Reading…" : "Ask"}</button></form>
    {error && <p className="mt-4 text-sm text-red-700">{error}</p>}{latestAnswer && <UpdateResponseBox documentId={documentId} responseType="ask_answer" original={latestAnswer.content} currentContext={{ scope_type: selection.scope_type, page_start: selection.page_start, page_end: selection.page_end }} onUpdated={(value) => updateWorkspace(documentId, { chatHistory: [...(workspace?.chatHistory ?? []), { role: "assistant", content: String(value), createdAt: new Date().toISOString() }] })} />}
  </div>;
}
