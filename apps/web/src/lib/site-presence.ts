const VISITOR_ID_STORAGE_KEY = "reviewo:visitor-id";

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const existingId = window.localStorage.getItem(VISITOR_ID_STORAGE_KEY)?.trim();

  if (existingId) {
    return existingId;
  }

  const visitorId = createVisitorId();
  window.localStorage.setItem(VISITOR_ID_STORAGE_KEY, visitorId);

  return visitorId;
}

function createVisitorId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
