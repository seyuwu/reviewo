/**
 * Runs at document_start before site bundles cache history.pushState.
 * The main content script re-installs the same hooks; this early pass
 * catches SPA frameworks that bind history methods during bootstrap.
 *
 * Also announces extension presence on Opinia web pages where the store
 * build does not inject web-auth-content (e.g. localhost dev).
 */
(() => {
  const OPINIA_WEB_ORIGINS = new Set([
    "https://opinia.ru",
    "http://localhost:3001",
    "http://127.0.0.1:3001"
  ]);
  const EXTENSION_PRESENCE_SOURCE = "reviewo-extension";

  const announceExtensionPresence = (): void => {
    if (!OPINIA_WEB_ORIGINS.has(window.location.origin)) {
      return;
    }

    const message = {
      source: EXTENSION_PRESENCE_SOURCE,
      type: "reviewo:extension-present"
    };

    window.postMessage(message, window.location.origin);
    window.addEventListener("message", (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.source !== "reviewo-web" || event.data?.type !== "reviewo:extension-ping") {
        return;
      }

      window.postMessage(message, window.location.origin);
    });
  };

  announceExtensionPresence();

  const notify = (): void => {
    window.dispatchEvent(new CustomEvent("reviewo:page-url-maybe-changed"));
  };

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPushState(...args);
    notify();
  };

  history.replaceState = (...args: Parameters<History["replaceState"]>) => {
    originalReplaceState(...args);
    notify();
  };

  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
})();
