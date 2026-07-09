import { resolveReliabilityLevel } from "@reviewo/shared";

import { isResolvablePageUrl } from "../shared/page-url.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";
import type {
  ExtensionResolveFoundResponse,
  ExtensionResolveResponse,
  ExtensionTrustConfidence
} from "../shared/types/resolve.js";
import { resolveUrlWithApi } from "./resolve-url.js";
import { getCachedTabResolveResult, cacheTabResolveResult } from "./tab-resolve-cache.js";

export type ActionBadgeState = "hidden" | "unknown" | "insufficient" | "trusted";

const BADGE_DOT = " ";
const BADGE_COLOR_INSUFFICIENT = "#737373";
const BADGE_COLOR_TRUSTED = "#16a34a";

const MIN_VOTES_FOR_TRUSTED_BADGE = 3;
const MIN_AVG_SCORE_FOR_TRUSTED_BADGE = 3.5;
const MIN_CONFIDENCE_FOR_TRUSTED_BADGE = 0.8;
const MAX_MANIPULATION_RISK_FOR_TRUSTED_BADGE = 0.5;
const MIN_DATA_RELIABILITY_FOR_TRUSTED_BADGE = 0.4;

export function isEntityTrustedForBadge(response: ExtensionResolveFoundResponse): boolean {
  const { rating, trust } = response;

  if (rating.votesCount < MIN_VOTES_FOR_TRUSTED_BADGE) {
    return false;
  }

  if (rating.avgScore < MIN_AVG_SCORE_FOR_TRUSTED_BADGE) {
    return false;
  }

  if (!isTrustReliableEnough(trust)) {
    return false;
  }

  if (
    trust.manipulationRisk !== undefined &&
    trust.manipulationRisk > MAX_MANIPULATION_RISK_FOR_TRUSTED_BADGE
  ) {
    return false;
  }

  if (
    trust.dataReliability !== undefined &&
    trust.dataReliability < MIN_DATA_RELIABILITY_FOR_TRUSTED_BADGE
  ) {
    return false;
  }

  return true;
}

export function isTrustReliableEnough(trust: ExtensionTrustConfidence): boolean {
  if (trust.confidence < MIN_CONFIDENCE_FOR_TRUSTED_BADGE) {
    return false;
  }

  const reliabilityLevel = trust.reliabilityLevel ?? resolveReliabilityLevel(trust.confidence);

  return reliabilityLevel === "high" || reliabilityLevel === "very_high";
}

export function resolveActionBadgeState(
  pageUrl: string | null | undefined,
  resolve: ExtensionResolveResponse | null | undefined
): ActionBadgeState {
  if (!pageUrl || !isResolvablePageUrl(pageUrl) || isReviewoWebPage(pageUrl)) {
    return "hidden";
  }

  if (!resolve) {
    return "hidden";
  }

  if (resolve.status === "not_found") {
    return "unknown";
  }

  return isEntityTrustedForBadge(resolve) ? "trusted" : "insufficient";
}

export async function applyActionBadge(tabId: number, state: ActionBadgeState): Promise<void> {
  if (state === "hidden" || state === "unknown") {
    await chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }

  await chrome.action.setBadgeBackgroundColor({
    tabId,
    color: state === "trusted" ? BADGE_COLOR_TRUSTED : BADGE_COLOR_INSUFFICIENT
  });
  await chrome.action.setBadgeText({ tabId, text: BADGE_DOT });
}

export async function updateActionBadgeForTab(tabId: number): Promise<void> {
  let pageUrl: string | undefined;

  try {
    const tab = await chrome.tabs.get(tabId);
    pageUrl = tab.url;
  } catch {
    return;
  }

  if (!pageUrl || !isResolvablePageUrl(pageUrl) || isReviewoWebPage(pageUrl)) {
    await applyActionBadge(tabId, "hidden");
    return;
  }

  let resolve = getCachedTabResolveResult(tabId);

  if (!resolve) {
    try {
      resolve = await resolveUrlWithApi(pageUrl);
      cacheTabResolveResult(tabId, resolve);
    } catch {
      await applyActionBadge(tabId, "hidden");
      return;
    }
  }

  const state = resolveActionBadgeState(pageUrl, resolve);

  await applyActionBadge(tabId, state);
}

export async function updateActionBadgesForEntity(
  entityId: string,
  canonicalUrl?: string
): Promise<void> {
  const tabs = await chrome.tabs.query({});

  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined) {
        return;
      }

      const resolve = getCachedTabResolveResult(tab.id);

      if (!resolve || resolve.status !== "found") {
        if (resolve?.status === "not_found" && canonicalUrl && resolve.url.canonical === canonicalUrl) {
          await updateActionBadgeForTab(tab.id);
        }

        return;
      }

      const matchesEntity =
        resolve.entity.id === entityId ||
        (canonicalUrl !== undefined && resolve.url.canonical === canonicalUrl);

      if (!matchesEntity) {
        return;
      }

      const state = resolveActionBadgeState(tab.url, resolve);

      await applyActionBadge(tab.id, state);
    })
  );
}

export function registerActionBadgeListeners(): void {
  chrome.tabs.onActivated.addListener((activeInfo) => {
    void updateActionBadgeForTab(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url !== undefined || changeInfo.status === "complete") {
      void updateActionBadgeForTab(tabId);
    }
  });
}
