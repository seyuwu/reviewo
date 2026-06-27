import { handleAuthMessage } from "./auth-handlers.js";
import { resolveUrlWithApi } from "./resolve-url.js";
import { cacheTabResolveResult, getCachedTabResolveResult } from "./tab-resolve-cache.js";
import {
  createActiveTabResolveResultMessage,
  createPongMessage,
  createResolvePageUrlErrorMessage,
  createResolvePageUrlResultMessage,
  isExtensionGetActiveTabResolveMessage,
  isExtensionPingMessage,
  isExtensionResolvePageUrlMessage,
  type ExtensionMessageSource
} from "../shared/messages.js";
import { isResolvablePageUrl } from "../shared/page-url.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (handleAuthMessage(message, sendResponse)) {
    return true;
  }

  if (isExtensionPingMessage(message)) {
    const source = message.payload.source as ExtensionMessageSource;
    sendResponse(createPongMessage(source));
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

        if (cachedResult) {
          sendResponse(createActiveTabResolveResultMessage(activeUrl, cachedResult));
          return;
        }

        const result = await resolveUrlWithApi(activeUrl);
        cacheTabResolveResult(activeTab.id, result);
        sendResponse(createActiveTabResolveResultMessage(activeUrl, result));
      })
      .catch(() => {
        sendResponse(createActiveTabResolveResultMessage(null, null));
      });

    return true;
  }

  return false;
});

console.info("Reviewo extension background worker is ready.");
