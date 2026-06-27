import type { ExtensionResolveResponse } from "../shared/types/resolve.js";

const resolveResultsByTabId = new Map<number, ExtensionResolveResponse>();

export function cacheTabResolveResult(tabId: number, result: ExtensionResolveResponse): void {
  resolveResultsByTabId.set(tabId, result);
}

export function getCachedTabResolveResult(tabId: number): ExtensionResolveResponse | undefined {
  return resolveResultsByTabId.get(tabId);
}
