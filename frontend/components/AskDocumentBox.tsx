"use client";

import { FormEvent, useState } from "react";
import { Loader2, MessageCircleQuestion, Send } from "lucide-react";
import { api } from "@/lib/api";

export function AskDocumentBox({ documentId }: { documentId: string }) {
  const [question, setQuestion] = useState(""); const [answer, setAnswer] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function submit(e: FormEvent) { e.preventDefault(); if (!question.trim()) return; setLoading(true); setError(""); try { const result = await api.ask(documentId, question); setAnswer(result.answer); } catch (err) { setError(err instanceof Error ? err.message : "Question failed."); } finally { setLoading(false); } }
  return <div><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-sage text-moss"><MessageCircleQuestion /></span><div><h2 className="text-xl font-semibold">Ask the document</h2><p className="text-sm text-ink/45">Answers use extracted text only and cite pages.</p></div></div><form onSubmit={submit} className="mt-7"><textarea className="field min-h-32 resize-y" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What is the central limitation, and where is it discussed?" /><button className="primary-button mt-3" disabled={loading || !question.trim()}>{loading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}{loading ? "Reading…" : "Ask"}</button></form>{error && <p className="mt-4 text-sm text-red-700">{error}</p>}{answer && <article className="mt-7 rounded-2xl border border-ink/10 bg-paper p-6"><p className="whitespace-pre-wrap leading-7 text-ink/75">{answer}</p></article>}</div>;
}

