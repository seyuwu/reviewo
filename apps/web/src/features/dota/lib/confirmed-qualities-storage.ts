import { getOrCreateDotaVisitorId } from "./visitor-id";

function buildStorageKey(slug: string): string {
  return `dota:confirmed:${slug}:${getOrCreateDotaVisitorId()}`;
}

export function getStoredConfirmedKeys(slug: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawValue = window.sessionStorage.getItem(buildStorageKey(slug));
    const parsed = rawValue ? (JSON.parse(rawValue) as unknown) : [];

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function setStoredConfirmedKeys(slug: string, qualityKeys: string[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(buildStorageKey(slug), JSON.stringify(qualityKeys));
}
