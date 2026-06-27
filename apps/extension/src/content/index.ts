import {
  guardExtensionContext,
  installExtensionContextGuards,
  sendRuntimeMessage
} from "./extension-context.js";
import { showRatingCardForResolveResult } from "./rating-card/rating-card.js";
import { requestShowRatingCardIfAllowed } from "./rating-card/rating-card-session.js";
import { watchPageUrlChanges } from "./page-resolve-watcher.js";
import { createResolvePageUrlMessage, ExtensionMessageType } from "../shared/messages.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";
import type { ExtensionResolveResponse } from "../shared/types/resolve.js";

installExtensionContextGuards();

const REVIEWO_RESOLVE_RESULT_EVENT = "reviewo:resolve-result";

function publishResolveResult(result: ExtensionResolveResponse): void {
  window.dispatchEvent(
    new CustomEvent<ExtensionResolveResponse>(REVIEWO_RESOLVE_RESULT_EVENT, {
      detail: result
    })
  );
}

function resolvePageUrl(pageUrl: string): void {
  if (!guardExtensionContext() || isReviewoWebPage(pageUrl)) {
    return;
  }

  sendRuntimeMessage(createResolvePageUrlMessage(pageUrl), (response) => {
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

      console.info("Reviewo content script received resolve result.", callbackResponse.payload);
      publishResolveResult(result);

      requestShowRatingCardIfAllowed(result.url.canonical, () => {
        void showRatingCardForResolveResult(result);
      });

      return;
    }

    if (response?.type === ExtensionMessageType.ResolvePageUrlError) {
      console.warn("Reviewo content script resolve failed.", callbackResponse.payload);
    }
  });
}

watchPageUrlChanges(resolvePageUrl);
