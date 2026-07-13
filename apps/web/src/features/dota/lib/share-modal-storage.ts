const STORAGE_PREFIX = "dota:share-modal-seen:";

export function hasSeenShareModal(slug: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(`${STORAGE_PREFIX}${slug}`) === "1";
}

export function markShareModalSeen(slug: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`${STORAGE_PREFIX}${slug}`, "1");
}
