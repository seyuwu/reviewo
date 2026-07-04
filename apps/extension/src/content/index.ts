import {
  addStorageChangedListener,
  guardExtensionContext,
  installExtensionContextGuards,
  sendRuntimeMessage
} from "./extension-context.js";
import { LOCALE_PREFERENCE_STORAGE_KEY } from "@reviewo/i18n";

import { hideRatingCard, isRatingCardVisible, refreshVisibleRatingCardLocale, showRatingCardForResolveResult, showRatingCardOnDemand } from "./rating-card/rating-card.js";
import { isAnyRatingCardPinned } from "./rating-card/card-pin.js";
import {
  isResolveResultForCurrentPage,
  requestShowRatingCardIfAllowed,
  readRatingCardSessionKey
} from "./rating-card/rating-card-session.js";
import { installRatingCardHotkeyTrigger } from "./rating-card/rating-card-hotkey-trigger.js";
import { watchPageUrlChanges } from "./page-resolve-watcher.js";
import { waitForPageContentReady } from "./rating-card/page-content-ready.js";
import { createResolvePageUrlMessage, createPageSourceTitleResultMessage, ExtensionMessageType, isExtensionGetPageSourceTitleMessage, isExtensionRequestShowRatingCardMessage } from "../shared/messages.js";
import { readCurrentPageSourceTitle } from "./page-source-title.js";
import { readCurrentPageUrl } from "../shared/page-url.js";
import { readPageIdentity } from "../shared/page-identity.js";
import { EXTENSION_PREFERENCES_STORAGE_KEY } from "../shared/preferences.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";
import type { ExtensionResolveResponse } from "../shared/types/resolve.js";

installExtensionContextGuards();

addStorageChangedListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (!(EXTENSION_PREFERENCES_STORAGE_KEY in changes || LOCALE_PREFERENCE_STORAGE_KEY in changes)) {
    return;
  }

  const nextPreferences = changes[EXTENSION_PREFERENCES_STORAGE_KEY]?.newValue as
    | { onSiteRatingCardEnabled?: boolean }
    | undefined;

  if (nextPreferences?.onSiteRatingCardEnabled === false) {
    hideRatingCard({ animated: false });
  }

  refreshVisibleRatingCardLocale();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isExtensionGetPageSourceTitleMessage(message)) {
    sendResponse(createPageSourceTitleResultMessage(readCurrentPageSourceTitle()));
    return false;
  }

  if (isExtensionRequestShowRatingCardMessage(message)) {
    triggerManualRatingCardShow();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

const REVIEWO_RESOLVE_RESULT_EVENT = "reviewo:resolve-result";

let latestResolveGeneration = 0;

type ResolveShowMode = "auto" | "manual";

function triggerManualRatingCardShow(): void {
  const generation = ++latestResolveGeneration;
  resolvePageUrl(readCurrentPageUrl(), generation, "manual");
}

function toggleManualRatingCardWithHotkey(): void {
  if (isRatingCardVisible()) {
    if (isAnyRatingCardPinned()) {
      return;
    }

    hideRatingCard({ animated: true });
    return;
  }

  triggerManualRatingCardShow();
}

installRatingCardHotkeyTrigger(toggleManualRatingCardWithHotkey);

function publishResolveResult(result: ExtensionResolveResponse): void {
  window.dispatchEvent(
    new CustomEvent<ExtensionResolveResponse>(REVIEWO_RESOLVE_RESULT_EVENT, {
      detail: result
    })
  );
}

function resolvePageUrl(
  pageUrl: string,
  generation: number,
  mode: ResolveShowMode = "auto"
): void {
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

      if (mode === "manual") {
        void showRatingCardOnDemand(result);
        return;
      }

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
