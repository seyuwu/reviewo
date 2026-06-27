import {
  guardExtensionContext,
  installExtensionContextGuards,
  onExtensionContextInvalidated,
  runWithExtensionContext
} from "./extension-context.js";
import { isResolvablePageUrl, readCurrentPageUrl } from "../shared/page-url.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";

const URL_POLL_INTERVAL_MS = 750;

type UrlChangeHandler = (pageUrl: string) => void;

export function watchPageUrlChanges(onUrlChange: UrlChangeHandler): () => void {
  let lastObservedUrl = "";

  const notifyIfChanged = (): void => {
    runWithExtensionContext(() => {
      const pageUrl = readCurrentPageUrl();

      if (!isResolvablePageUrl(pageUrl) || isReviewoWebPage(pageUrl) || pageUrl === lastObservedUrl) {
        return;
      }

      lastObservedUrl = pageUrl;
      onUrlChange(pageUrl);
    });
  };

  const cleanups: Array<() => void> = [
    installHistoryHooks(notifyIfChanged),
    installNavigationApiHook(notifyIfChanged),
    installSiteNavigationHooks(notifyIfChanged)
  ];

  notifyIfChanged();

  const pollIntervalId = window.setInterval(notifyIfChanged, URL_POLL_INTERVAL_MS);
  cleanups.push(() => {
    window.clearInterval(pollIntervalId);
  });

  window.addEventListener("pageshow", notifyIfChanged);
  cleanups.push(() => {
    window.removeEventListener("pageshow", notifyIfChanged);
  });

  window.addEventListener("reviewo:page-url-maybe-changed", notifyIfChanged);
  cleanups.push(() => {
    window.removeEventListener("reviewo:page-url-maybe-changed", notifyIfChanged);
  });

  onExtensionContextInvalidated(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  });

  return notifyIfChanged;
}

function installHistoryHooks(notifyIfChanged: () => void): () => void {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    originalPushState(...args);
    notifyIfChanged();
  };

  history.replaceState = (...args) => {
    originalReplaceState(...args);
    notifyIfChanged();
  };

  window.addEventListener("popstate", notifyIfChanged);
  window.addEventListener("hashchange", notifyIfChanged);

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", notifyIfChanged);
    window.removeEventListener("hashchange", notifyIfChanged);
  };
}

function installNavigationApiHook(notifyIfChanged: () => void): () => void {
  const navigationApi = (window as Window & { navigation?: Navigation }).navigation;

  if (!navigationApi) {
    return () => undefined;
  }

  const onNavigate = (): void => {
    window.setTimeout(notifyIfChanged, 0);
  };

  navigationApi.addEventListener("navigate", onNavigate);
  navigationApi.addEventListener("navigatesuccess", notifyIfChanged);

  return () => {
    navigationApi.removeEventListener("navigate", onNavigate);
    navigationApi.removeEventListener("navigatesuccess", notifyIfChanged);
  };
}

function installSiteNavigationHooks(notifyIfChanged: () => void): () => void {
  const siteEvents = [
    "yt-navigate-finish",
    "yt-page-data-updated",
    "twitch:locationchange"
  ] as const;

  for (const eventName of siteEvents) {
    document.addEventListener(eventName, notifyIfChanged);
    window.addEventListener(eventName, notifyIfChanged);
  }

  return () => {
    for (const eventName of siteEvents) {
      document.removeEventListener(eventName, notifyIfChanged);
      window.removeEventListener(eventName, notifyIfChanged);
    }
  };
}
