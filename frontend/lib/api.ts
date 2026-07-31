import { supabase } from "./supabaseClient";
import type { DocumentRecord, Note, PodcastScript, ReadingRoute } from "./types";

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

  generateReadingRoute: (documentId: string) =>
    request<ReadingRoute>("/ai/reading-route", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId }),
    }),

  generatePodcast: (documentId: string) =>
    request<PodcastScript>("/ai/podcast-script", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId, duration_minutes: 8 }),
    }),

  ask: (documentId: string, question: string) =>
    request<{ answer: string }>("/ai/ask", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId, question }),
    }),

  async generateAudio(documentId: string, script: string) {
    const result = await request<{ signed_url: string }>("/ai/text-to-speech", {
      method: "POST",
      body: JSON.stringify({ document_id: documentId, script }),
    });

    return result.signed_url;
  },

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
