const VISITOR_ID_STORAGE_KEY = "reviewo:dota-visitor-id";

export function getOrCreateDotaVisitorId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const existing = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY);

  if (existing) {
    return existing;
  }

  const visitorId = crypto.randomUUID();
  window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);

  return visitorId;
}
