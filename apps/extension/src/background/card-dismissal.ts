const dismissedCardsByTab = new Map<number, Set<string>>();

function dismissalKey(canonicalUrl: string): string {
  return canonicalUrl.trim().toLowerCase();
}

export function dismissRatingCardForTab(tabId: number, canonicalUrl: string): void {
  const key = dismissalKey(canonicalUrl);
  const dismissed = dismissedCardsByTab.get(tabId) ?? new Set<string>();
  dismissed.add(key);
  dismissedCardsByTab.set(tabId, dismissed);
}

export function isRatingCardDismissedForTab(tabId: number, canonicalUrl: string): boolean {
  const dismissed = dismissedCardsByTab.get(tabId);

  if (!dismissed) {
    return false;
  }

  return dismissed.has(dismissalKey(canonicalUrl));
}

export function clearDismissalsForTab(tabId: number): void {
  dismissedCardsByTab.delete(tabId);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  clearDismissalsForTab(tabId);
});
