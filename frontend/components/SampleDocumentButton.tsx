"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export function SampleDocumentButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter(); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function open() { setLoading(true); setError(""); try { const document = await api.getSampleDocument(); router.push(`/document/${document.id}`); } catch (e) { setError(e instanceof Error ? e.message : "Sample unavailable."); setLoading(false); } }
  return <div><button className={compact ? "secondary-button" : "primary-button inline-flex"} onClick={open} disabled={loading}>{loading ? <Loader2 size={17} className="animate-spin" /> : <BookOpenCheck size={17} />}{loading ? "Preparing sample…" : "Try sample document"}</button>{error && <p className="mt-2 max-w-xs text-xs text-red-700">{error}</p>}</div>;
}
