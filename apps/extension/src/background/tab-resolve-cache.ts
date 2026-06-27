import type { ExtensionResolveResponse } from "../shared/types/resolve.js";
import type { ExtensionQuickRatingResponse } from "../shared/types/quick-rating.js";
import { readPageIdentity } from "../shared/page-identity.js";
import {
  mergeQuickRatingIntoFoundResponse,
  toFoundResponseFromQuickRating
} from "../shared/merge-rating-response.js";

const resolveResultsByTabId = new Map<number, ExtensionResolveResponse>();

export function cacheTabResolveResult(tabId: number, result: ExtensionResolveResponse): void {
  resolveResultsByTabId.set(tabId, result);
}

export function getCachedTabResolveResult(tabId: number): ExtensionResolveResponse | undefined {
  return resolveResultsByTabId.get(tabId);
}

export function doesCachedResolveMatchPageUrl(
  result: ExtensionResolveResponse,
  pageUrl: string
): boolean {
  const resolvedIdentity = readPageIdentity(result.url.input);
  const pageIdentity = readPageIdentity(pageUrl);

  if (resolvedIdentity && pageIdentity) {
    return resolvedIdentity === pageIdentity;
  }

  return result.url.input === pageUrl || result.url.canonical === pageUrl;
}

export function patchCachedResolveWithRating(
  entityId: string,
  quickRating: ExtensionQuickRatingResponse,
  canonicalUrl?: string
): void {
  for (const [tabId, result] of resolveResultsByTabId.entries()) {
    if (result.status === "not_found") {
      if (canonicalUrl && result.url.canonical === canonicalUrl) {
        resolveResultsByTabId.set(
          tabId,
          toFoundResponseFromQuickRating(result, quickRating)
        );
      }

      continue;
    }

    if (result.entity.id === entityId) {
      resolveResultsByTabId.set(tabId, mergeQuickRatingIntoFoundResponse(result, quickRating));
      continue;
    }

    if (result.parent?.entity.id === entityId) {
      const patchedParent: NonNullable<typeof result.parent> = {
        ...result.parent,
        entity: quickRating.entity,
        rating: quickRating.rating,
        trust: quickRating.trust,
        web: quickRating.web
      };

      resolveResultsByTabId.set(tabId, {
        ...result,
        parent: patchedParent
      });
    }
  }
}

export function resetTabResolveCacheForTests(): void {
  resolveResultsByTabId.clear();
}

export function readTabResolveCacheForTests(): Map<number, ExtensionResolveResponse> {
  return resolveResultsByTabId;
}
