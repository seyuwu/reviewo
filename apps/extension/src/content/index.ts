import { showRatingCardForFoundEntity } from "./rating-card/rating-card.js";
import { createResolvePageUrlMessage, ExtensionMessageType } from "../shared/messages.js";
import { isResolvablePageUrl, readCurrentPageUrl } from "../shared/page-url.js";
import type { ExtensionResolveResponse } from "../shared/types/resolve.js";

export const REVIEWO_RESOLVE_RESULT_EVENT = "reviewo:resolve-result";

function publishResolveResult(result: ExtensionResolveResponse): void {
  window.dispatchEvent(
    new CustomEvent<ExtensionResolveResponse>(REVIEWO_RESOLVE_RESULT_EVENT, {
      detail: result
    })
  );
}

function requestResolveForCurrentPage(): void {
  const pageUrl = readCurrentPageUrl();

  if (!isResolvablePageUrl(pageUrl)) {
    return;
  }

  chrome.runtime.sendMessage(createResolvePageUrlMessage(pageUrl), (response) => {
    if (chrome.runtime.lastError) {
      console.warn(
        "Reviewo content script could not resolve page URL:",
        chrome.runtime.lastError.message
      );
      return;
    }

    if (response?.type === ExtensionMessageType.ResolvePageUrlResult) {
      console.info("Reviewo content script received resolve result.", response.payload);
      publishResolveResult(response.payload.result);

      if (response.payload.result.status === "found") {
        showRatingCardForFoundEntity(response.payload.result);
      }

      return;
    }

    if (response?.type === ExtensionMessageType.ResolvePageUrlError) {
      console.warn("Reviewo content script resolve failed.", response.payload);
    }
  });
}

requestResolveForCurrentPage();
