const SESSION_KEY = "paperguide-anonymous-session";

export function getAnonymousSessionId(): string {
  if (typeof window === "undefined") return "server-session";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const value = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(SESSION_KEY, value);
  return value;
}
