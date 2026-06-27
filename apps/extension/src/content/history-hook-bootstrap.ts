/**
 * Runs at document_start before site bundles cache history.pushState.
 * The main content script re-installs the same hooks; this early pass
 * catches SPA frameworks that bind history methods during bootstrap.
 */
(() => {
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
