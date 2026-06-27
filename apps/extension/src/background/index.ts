import { handleAuthMessage } from "./auth-handlers.js";
import { handlePublicApiMessage } from "./public-api-handlers.js";
import {
  dismissRatingCardForTab,
  markEntityRatedOnTab,
  shouldShowRatingCardForTab
} from "./card-dismissal.js";
import { resolveUrlWithApi } from "./resolve-url.js";
import { readPageSourceTitleFromTab } from "./read-page-source-title.js";
import { cacheTabResolveResult, doesCachedResolveMatchPageUrl, getCachedTabResolveResult, patchCachedResolveWithRating } from "./tab-resolve-cache.js";
import {
  createActiveTabResolveResultMessage,
  createPongMessage,
  createRatingCardDismissedResultMessage,
  createResolvePageUrlErrorMessage,
  createResolvePageUrlResultMessage,
  isExtensionCheckRatingCardDismissedMessage,
  isExtensionDismissRatingCardMessage,
  isExtensionEntityRatingUpdatedMessage,
  isExtensionGetActiveTabResolveMessage,
  isExtensionMarkEntityRatedOnTabMessage,
  isExtensionPingMessage,
  isExtensionResolvePageUrlMessage,
  type ExtensionMessageSource
} from "../shared/messages.js";
import { isResolvablePageUrl } from "../shared/page-url.js";
import { isSiteSnoozed } from "../shared/site-snooze.js";

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "reviewo-content-script") {
    return;
  }

  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (handleAuthMessage(message, sendResponse)) {
    return true;
  }

  if (handlePublicApiMessage(message, sendResponse)) {
    return true;
  }

  if (isExtensionPingMessage(message)) {
    const source = message.payload.source as ExtensionMessageSource;
    sendResponse(createPongMessage(source));
    return false;
  }

  if (isExtensionCheckRatingCardDismissedMessage(message)) {
    const tabId = sender.tab?.id;

    if (tabId === undefined) {
      sendResponse(createRatingCardDismissedResultMessage(false));
      return false;
    }

    void (async () => {
      const siteSnoozed = await isSiteSnoozed(message.payload.siteHostname);
      const shouldHide =
        siteSnoozed || !shouldShowRatingCardForTab(tabId, message.payload.canonicalUrl);

      sendResponse(createRatingCardDismissedResultMessage(shouldHide));
    })();

    return true;
  }

  if (isExtensionMarkEntityRatedOnTabMessage(message)) {
    const tabId = sender.tab?.id;

    if (tabId !== undefined) {
      markEntityRatedOnTab(tabId, message.payload.canonicalUrl);
    }

    return false;
  }

  if (isExtensionEntityRatingUpdatedMessage(message)) {
    if (message.payload.quickRating) {
      patchCachedResolveWithRating(
        message.payload.entityId,
        message.payload.quickRating,
        message.payload.canonicalUrl
      );
    }

    return false;
  }

  if (isExtensionDismissRatingCardMessage(message)) {
    const tabId = sender.tab?.id;

    if (tabId !== undefined) {
      dismissRatingCardForTab(tabId, message.payload.canonicalUrl);
    }

    sendResponse(createRatingCardDismissedResultMessage(true));
    return false;
  }

  if (isExtensionResolvePageUrlMessage(message)) {
    const { url } = message.payload;

    void resolveUrlWithApi(url)
      .then((result) => {
        const tabId = sender.tab?.id;

        if (tabId !== undefined) {
          cacheTabResolveResult(tabId, result);
        }

        sendResponse(createResolvePageUrlResultMessage(url, result));
      })
      .catch((error: unknown) => {
        const messageText =
          error instanceof Error ? error.message : "Extension resolve failed unexpectedly.";

        sendResponse(createResolvePageUrlErrorMessage(url, messageText));
      });

    return true;
  }

  if (isExtensionGetActiveTabResolveMessage(message)) {
    void chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(async (tabs) => {
        const activeTab = tabs[0];
        const activeUrl = activeTab?.url ?? null;

        if (!activeTab?.id || !activeUrl || !isResolvablePageUrl(activeUrl)) {
          sendResponse(createActiveTabResolveResultMessage(activeUrl, null));
          return;
        }

        const cachedResult = getCachedTabResolveResult(activeTab.id);
        const pageTitle = await readPageSourceTitleFromTab(activeTab.id);

        if (cachedResult && doesCachedResolveMatchPageUrl(cachedResult, activeUrl)) {
          sendResponse(createActiveTabResolveResultMessage(activeUrl, cachedResult, pageTitle));
          return;
        }

        const result = await resolveUrlWithApi(activeUrl);
        cacheTabResolveResult(activeTab.id, result);
        sendResponse(createActiveTabResolveResultMessage(activeUrl, result, pageTitle));
      })
      .catch(() => {
        sendResponse(createActiveTabResolveResultMessage(null, null));
      });

    return true;
  }

  return false;
});

console.info("Reviewo extension background worker is ready.");
