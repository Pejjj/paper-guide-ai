import { supabase } from "./supabaseClient";
import { getAnonymousSessionId } from "./analytics";
import type { AIOutput, AIOutputVersion, ConceptGuide, DocumentRecord, DocumentStructure, MethodWalkthrough, Note, PodcastScript, ReadingRoute, SectionIntro } from "./types";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000"
).replace(/\/$/, "");

async function getFreshSession() {
  if (!supabase) {
    throw new Error("Supabase is not configured in the frontend. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.");
  }

  const existing = await supabase.auth.getSession();

  if (existing.data.session) {
    const checked = await supabase.auth.getUser();

    if (!checked.error && checked.data.user) {
      return existing.data.session;
    }

    await supabase.auth.signOut();
  }

  const anonymous = await supabase.auth.signInAnonymously();

  if (anonymous.error || !anonymous.data.session) {
    throw new Error(`Anonymous sign-in failed: ${anonymous.error?.message ?? "No session returned."}`);
  }

  return anonymous.data.session;
}

async function authHeaders(): Promise<Record<string, string>> {
  const session = await getFreshSession();
  return { Authorization: `Bearer ${session.access_token}` };
}

async function parseError(response: Response): Promise<string> {
  let message = `Request failed (${response.status})`;

  try {
    const body = await response.json();
    message = body.detail ?? body.message ?? message;
  } catch {
    try {
      const text = await response.text();
      if (text) message = text;
    } catch {}
  }

  return message;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const auth = await authHeaders();

  const headers = new Headers(init.headers);
  Object.entries(auth).forEach(([key, value]) => headers.set(key, value));
  headers.set("X-Anonymous-Session-Id", getAnonymousSessionId());

  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    const message = await parseError(response);

    const authProblem =
      response.status === 401 &&
      (message.toLowerCase().includes("invalid") ||
        message.toLowerCase().includes("expired") ||
        message.toLowerCase().includes("sign in"));

    if (authProblem && retry && supabase) {
      await supabase.auth.signOut();
      return request<T>(path, init, false);
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  async uploadDocument(file: File) {
    const body = new FormData();
    body.append("file", file);
    return request<DocumentRecord>("/documents/upload", { method: "POST", body });
  },

  getDocuments: () => request<DocumentRecord[]>("/documents"),

  getDocument: (id: string) => request<DocumentRecord>(`/documents/${id}`),

  getSampleDocument: () => request<DocumentRecord>("/documents/sample"),

  generateReadingRoute: (documentId: string) =>
    request<ReadingRoute>("/ai/reading-route", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId }),
    }),

  generatePodcast: (documentId: string, options: { scope_type?: string; page_start?: number | null; page_end?: number | null; mode?: string } = {}) =>
    request<PodcastScript>("/ai/podcast-script", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId, duration_minutes: 8, ...options }),
    }),

  ask: (documentId: string, question: string, scope: { scope_type?: string; page_start?: number | null; page_end?: number | null } = {}) =>
    request<{ answer: string }>("/ai/ask", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId, question, ...scope }),
    }),

  generateChapterMap: (documentId: string) => request<DocumentStructure>("/ai/chapter-map", { method: "POST", body: JSON.stringify({ document_id: documentId }) }),

  generateSectionIntro: (documentId: string, input: { section_id?: string; section_title?: string; page_start: number; page_end: number; user_level: string; focus: string }) => request<SectionIntro>("/ai/section-intro", { method: "POST", body: JSON.stringify({ document_id: documentId, ...input }) }),

  generateMethodWalkthrough: (documentId: string, pageStart: number, pageEnd: number, userGoal = "understand") => request<MethodWalkthrough>("/ai/method-walkthrough", { method: "POST", body: JSON.stringify({ document_id: documentId, page_start: pageStart, page_end: pageEnd, user_goal: userGoal }) }),

  generateConceptGuide: (documentId: string, concept: string, pageStart?: number | null, pageEnd?: number | null) => request<ConceptGuide>("/ai/concept-guide", { method: "POST", body: JSON.stringify({ document_id: documentId, concept_or_question: concept, page_start: pageStart, page_end: pageEnd }) }),

  updateResponse: (documentId: string, originalResponseType: string, originalResponse: unknown, instruction: string, currentContext: Record<string, unknown> = {}, responseId?: string) => request<{ response_id: string; version_number: number; updated_response: unknown; explanation_of_changes: string; user_instruction: string }>("/ai/update-response", { method: "POST", body: JSON.stringify({ document_id: documentId, response_id: responseId, original_response_type: originalResponseType, original_response_json: originalResponse, user_instruction: instruction, current_context: currentContext }) }),

  getAIOutputs: (documentId: string) => request<{ outputs: AIOutput[]; versions: AIOutputVersion[] }>(`/ai-outputs/${documentId}`),

  revertOutput: (outputId: string, versionNumber: number) => request<{ output_id: string; version_number: number; payload: unknown }>(`/ai-outputs/${outputId}/revert/${versionNumber}`, { method: "POST" }),

  track: (event_name: string, path: string, metadata: Record<string, string | number | boolean | null> = {}) => request<{ accepted: boolean }>("/analytics/events", { method: "POST", body: JSON.stringify({ event_name, path, anonymous_session_id: getAnonymousSessionId(), metadata }) }),

  saveNote: (documentId: string, content: string, pageNumber: number | null) =>
    request<Note>("/notes", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId, content, page_number: pageNumber }),
    }),

  getNotes: (documentId: string) => request<Note[]>(`/notes/${documentId}`),

  async exportNotes(documentId: string) {
    const auth = await authHeaders();
    const response = await fetch(`${API_URL}/notes/${documentId}/export.md`, {
      headers: auth,
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return response.blob();
  },
};
