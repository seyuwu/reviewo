const dismissedCardsByTab = new Map<number, Set<string>>();
const ratedEntityQuotaByTab = new Map<number, Map<string, RatedEntityQuota>>();

interface RatedEntityQuota {
  remainingShows: number;
}

function dismissalKey(canonicalUrl: string): string {
  return canonicalUrl.trim().toLowerCase();
}

export function dismissRatingCardForTab(tabId: number, canonicalUrl: string): void {
  const key = dismissalKey(canonicalUrl);
  const dismissed = dismissedCardsByTab.get(tabId) ?? new Set<string>();
  dismissed.add(key);
  dismissedCardsByTab.set(tabId, dismissed);
}

export function markEntityRatedOnTab(tabId: number, canonicalUrl: string): void {
  const key = dismissalKey(canonicalUrl);
  const quotas = ratedEntityQuotaByTab.get(tabId) ?? new Map<string, RatedEntityQuota>();
  quotas.set(key, { remainingShows: 1 });
  ratedEntityQuotaByTab.set(tabId, quotas);
}

export function shouldShowRatingCardForTab(tabId: number, canonicalUrl: string): boolean {
  if (isRatingCardDismissedForTab(tabId, canonicalUrl)) {
    return false;
  }

  const key = dismissalKey(canonicalUrl);
  const quota = ratedEntityQuotaByTab.get(tabId)?.get(key);

  if (!quota) {
    return true;
  }

  if (quota.remainingShows <= 0) {
    return false;
  }

  quota.remainingShows -= 1;
  return true;
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
  ratedEntityQuotaByTab.delete(tabId);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  clearDismissalsForTab(tabId);
});
