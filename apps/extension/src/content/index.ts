import {
  guardExtensionContext,
  installExtensionContextGuards,
  sendRuntimeMessage
} from "./extension-context.js";
import { hideRatingCard, showRatingCardForResolveResult } from "./rating-card/rating-card.js";
import {
  isResolveResultForCurrentPage,
  requestShowRatingCardIfAllowed,
  readRatingCardSessionKey
} from "./rating-card/rating-card-session.js";
import { watchPageUrlChanges } from "./page-resolve-watcher.js";
import { waitForPageContentReady } from "./rating-card/page-content-ready.js";
import { createResolvePageUrlMessage, createPageSourceTitleResultMessage, ExtensionMessageType, isExtensionGetPageSourceTitleMessage, isExtensionRequestShowRatingCardMessage } from "../shared/messages.js";
import { readCurrentPageSourceTitle } from "./page-source-title.js";
import { readCurrentPageUrl } from "../shared/page-url.js";
import { readPageIdentity } from "../shared/page-identity.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";
import type { ExtensionResolveResponse } from "../shared/types/resolve.js";

installExtensionContextGuards();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isExtensionGetPageSourceTitleMessage(message)) {
    sendResponse(createPageSourceTitleResultMessage(readCurrentPageSourceTitle()));
    return false;
  }

  if (isExtensionRequestShowRatingCardMessage(message)) {
    const generation = ++latestResolveGeneration;
    resolvePageUrl(readCurrentPageUrl(), generation);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

const REVIEWO_RESOLVE_RESULT_EVENT = "reviewo:resolve-result";

let latestResolveGeneration = 0;

function publishResolveResult(result: ExtensionResolveResponse): void {
  window.dispatchEvent(
    new CustomEvent<ExtensionResolveResponse>(REVIEWO_RESOLVE_RESULT_EVENT, {
      detail: result
    })
  );
}

function resolvePageUrl(pageUrl: string, generation: number): void {
  if (!guardExtensionContext() || isReviewoWebPage(pageUrl)) {
    return;
  }

  sendRuntimeMessage(createResolvePageUrlMessage(pageUrl), (response) => {
    if (generation !== latestResolveGeneration) {
      return;
    }

    const callbackResponse = response as {
      payload?: {
        message?: string;
        result?: ExtensionResolveResponse;
      };
      type?: string;
    };

    if (response?.type === ExtensionMessageType.ResolvePageUrlResult) {
      const result = callbackResponse.payload?.result;

      if (!result) {
        return;
      }

      if (!isResolveResultForCurrentPage(result)) {
        return;
      }

      console.info("Reviewo content script received resolve result.", callbackResponse.payload);
      publishResolveResult(result);

      requestShowRatingCardIfAllowed(readRatingCardSessionKey(result.url.input), () => {
        if (generation !== latestResolveGeneration) {
          return;
        }

        if (!isResolveResultForCurrentPage(result)) {
          return;
        }

        void showRatingCardForResolveResult(result);
      });

      return;
    }

    if (response?.type === ExtensionMessageType.ResolvePageUrlError) {
      console.warn("Reviewo content script resolve failed.", callbackResponse.payload);
    }
  });
}

watchPageUrlChanges(
  (pageUrl) => {
    const generation = ++latestResolveGeneration;
    const expectedIdentity = readPageIdentity(pageUrl);

    void waitForPageContentReady(pageUrl, () => generation === latestResolveGeneration).then(
      (ready) => {
        if (!ready || generation !== latestResolveGeneration) {
          return;
        }

        const settledPageUrl = readCurrentPageUrl();

        if (expectedIdentity && readPageIdentity(settledPageUrl) !== expectedIdentity) {
          return;
        }

        resolvePageUrl(settledPageUrl, generation);
      }
    );
  },
  {
    onPageNavigation: () => {
      hideRatingCard({ animated: false });
    }
  }
);
