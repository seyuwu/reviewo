import {
  guardExtensionContext,
  onExtensionContextInvalidated,
  runWithExtensionContext
} from "./extension-context.js";
import { isResolvablePageUrl, readCurrentPageUrl } from "../shared/page-url.js";
import { readPageIdentity } from "../shared/page-identity.js";
import { isReviewoWebPage } from "../shared/reviewo-web-page.js";
import { getNavigationSettleDelaysMs } from "./rating-card/page-content-ready.js";

const URL_POLL_INTERVAL_MS = 500;

export interface PageUrlWatchOptions {
  onIdentityChange?: (pageUrl: string, identity: string) => void;
  onPageNavigation?: () => void;
}

type UrlChangeHandler = (pageUrl: string) => void;

export function watchPageUrlChanges(
  onUrlChange: UrlChangeHandler,
  options?: PageUrlWatchOptions
): () => void {
  let lastObservedIdentity = "";

  const notifyIfChanged = (): void => {
    runWithExtensionContext(() => {
      const pageUrl = readCurrentPageUrl();

      if (!isResolvablePageUrl(pageUrl) || isReviewoWebPage(pageUrl)) {
        return;
      }

      const identity = readPageIdentity(pageUrl);

      if (!identity || identity === lastObservedIdentity) {
        return;
      }

      options?.onPageNavigation?.();
      lastObservedIdentity = identity;
      options?.onIdentityChange?.(pageUrl, identity);
      onUrlChange(pageUrl);
    });
  };

  const scheduleNotify = createDebouncedNotify(notifyIfChanged);
  const notifyPageNavigation = (): void => {
    options?.onPageNavigation?.();
  };
  const cleanups: Array<() => void> = [
    installHistoryHooks(notifyPageNavigation, scheduleNotify),
    installNavigationApiHook(notifyPageNavigation, scheduleNotify),
    installSiteNavigationHooks(notifyPageNavigation, scheduleNotify)
  ];

  scheduleNotify();

  const pollIntervalId = window.setInterval(notifyIfChanged, URL_POLL_INTERVAL_MS);
  cleanups.push(() => {
    window.clearInterval(pollIntervalId);
  });

  window.addEventListener("pageshow", scheduleNotify);
  cleanups.push(() => {
    window.removeEventListener("pageshow", scheduleNotify);
  });

  window.addEventListener("reviewo:page-url-maybe-changed", scheduleNotify);
  cleanups.push(() => {
    window.removeEventListener("reviewo:page-url-maybe-changed", scheduleNotify);
  });

  onExtensionContextInvalidated(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  });

  return notifyIfChanged;
}

function createDebouncedNotify(notifyIfChanged: () => void): () => void {
  const timeoutIds: number[] = [];

  const scheduleNotify = (): void => {
    for (const timeoutId of timeoutIds) {
      window.clearTimeout(timeoutId);
    }

    timeoutIds.length = 0;

    const delays = getNavigationSettleDelaysMs(readCurrentPageUrl());

    for (const delayMs of delays) {
      timeoutIds.push(
        window.setTimeout(() => {
          notifyIfChanged();
        }, delayMs)
      );
    }
  };

  onExtensionContextInvalidated(() => {
    for (const timeoutId of timeoutIds) {
      window.clearTimeout(timeoutId);
    }

    timeoutIds.length = 0;
  });

  return scheduleNotify;
}

function installHistoryHooks(
  onPageNavigation: () => void,
  scheduleNotify: () => void
): () => void {
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  const handleNavigation = (): void => {
    onPageNavigation();
    scheduleNotify();
  };

  history.pushState = (...args) => {
    originalPushState(...args);
    handleNavigation();
  };

  history.replaceState = (...args) => {
    originalReplaceState(...args);
    handleNavigation();
  };

  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("hashchange", handleNavigation);

  return () => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", handleNavigation);
    window.removeEventListener("hashchange", handleNavigation);
  };
}

function installNavigationApiHook(
  onPageNavigation: () => void,
  scheduleNotify: () => void
): () => void {
  const navigationApi = (window as Window & { navigation?: Navigation }).navigation;

  if (!navigationApi) {
    return () => undefined;
  }

  const onNavigate = (): void => {
    onPageNavigation();
    scheduleNotify();
  };

  navigationApi.addEventListener("navigate", onNavigate);
  navigationApi.addEventListener("navigatesuccess", scheduleNotify);

  return () => {
    navigationApi.removeEventListener("navigate", onNavigate);
    navigationApi.removeEventListener("navigatesuccess", scheduleNotify);
  };
}

function installSiteNavigationHooks(
  onPageNavigation: () => void,
  scheduleNotify: () => void
): () => void {
  const navigationStartEvents = ["yt-navigate", "twitch:locationchange"] as const;
  const navigationSettleEvents = ["yt-navigate-finish", "yt-page-data-updated"] as const;

  const handlePageNavigation = (): void => {
    onPageNavigation();
    scheduleNotify();
  };

  for (const eventName of navigationStartEvents) {
    document.addEventListener(eventName, onPageNavigation);
    window.addEventListener(eventName, onPageNavigation);
  }

  for (const eventName of navigationSettleEvents) {
    document.addEventListener(eventName, scheduleNotify);
    window.addEventListener(eventName, scheduleNotify);
  }

  return () => {
    for (const eventName of navigationStartEvents) {
      document.removeEventListener(eventName, handlePageNavigation);
      window.removeEventListener(eventName, handlePageNavigation);
    }

    for (const eventName of navigationSettleEvents) {
      document.removeEventListener(eventName, scheduleNotify);
      window.removeEventListener(eventName, scheduleNotify);
    }
  };
}
