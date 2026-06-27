import type { ExtensionResolveResponse } from "../../shared/types/resolve.js";
import { isTwitchPage, isYouTubePage, readPageSourceTitle } from "./read-page-title.js";
import { deriveTitleFromCanonicalUrl } from "./title-from-url.js";

const DEFAULT_TITLE_REFRESH_DELAYS_MS = [0, 200, 500] as const;
const YOUTUBE_TITLE_REFRESH_DELAYS_MS = [0, 400, 800, 1500] as const;
const TWITCH_TITLE_REFRESH_DELAYS_MS = [0, 300, 800, 1500, 2500] as const;

export function getCardTitleRefreshDelaysMs(pageUrl: string): readonly number[] {
  if (isTwitchPage(pageUrl)) {
    return TWITCH_TITLE_REFRESH_DELAYS_MS;
  }

  if (isYouTubePage(pageUrl)) {
    return YOUTUBE_TITLE_REFRESH_DELAYS_MS;
  }

  return DEFAULT_TITLE_REFRESH_DELAYS_MS;
}

export function resolveCardDisplayTitle(
  response: ExtensionResolveResponse,
  pageTitle: string | undefined = readPageSourceTitle(response.url.input)
): string {
  if (response.status === "not_found") {
    return pageTitle ?? deriveTitleFromCanonicalUrl(response.url.canonical);
  }

  if (pageTitle && isGenericEntityTitle(response.entity.title, response.url.canonical)) {
    return pageTitle;
  }

  return response.entity.title;
}

export function isGenericEntityTitle(entityTitle: string, canonicalUrl: string): boolean {
  const normalizedTitle = entityTitle.trim().toLowerCase();

  if (!normalizedTitle) {
    return true;
  }

  const hostname = deriveTitleFromCanonicalUrl(canonicalUrl).toLowerCase();

  if (normalizedTitle === hostname) {
    return true;
  }

  if (normalizedTitle === `www.${hostname}`) {
    return true;
  }

  const hostBase = hostname.split(".")[0];

  if (hostBase && normalizedTitle === hostBase) {
    return true;
  }

  return false;
}

export function installCardTitleRefresh(
  onRefresh: () => void,
  pageUrl: string = window.location.href,
  onSettled?: () => void
): () => void {
  const delays = getCardTitleRefreshDelaysMs(pageUrl);
  const timeoutIds: number[] = [];

  const scheduleRefresh = (includeSettle = false): void => {
    for (const delayMs of delays) {
      timeoutIds.push(window.setTimeout(onRefresh, delayMs));
    }

    if (includeSettle && onSettled && delays.length > 0) {
      const settleDelayMs = Math.max(...delays);
      timeoutIds.push(window.setTimeout(onSettled, settleDelayMs));
    }
  };

  const scheduleRefreshFromEvent = (): void => {
    for (const delayMs of delays) {
      window.setTimeout(onRefresh, delayMs);
    }
  };

  const cleanups: Array<() => void> = [installSiteTitleRefreshEvents(scheduleRefreshFromEvent)];

  if (isTwitchPage(pageUrl)) {
    cleanups.push(installTwitchTitleObserver(scheduleRefreshFromEvent));
  }

  scheduleRefresh(true);

  return () => {
    for (const timeoutId of timeoutIds) {
      window.clearTimeout(timeoutId);
    }

    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

function installSiteTitleRefreshEvents(scheduleRefresh: () => void): () => void {
  const siteEvents = ["yt-page-data-updated", "yt-navigate-finish", "twitch:locationchange"] as const;

  window.addEventListener("pageshow", scheduleRefresh);

  for (const eventName of siteEvents) {
    document.addEventListener(eventName, scheduleRefresh);
    window.addEventListener(eventName, scheduleRefresh);
  }

  return () => {
    window.removeEventListener("pageshow", scheduleRefresh);

    for (const eventName of siteEvents) {
      document.removeEventListener(eventName, scheduleRefresh);
      window.removeEventListener(eventName, scheduleRefresh);
    }
  };
}

function installTwitchTitleObserver(scheduleRefresh: () => void): () => void {
  let debounceTimer: number | undefined;

  const debouncedScheduleRefresh = (): void => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      scheduleRefresh();
    }, 100);
  };

  const observer = new MutationObserver(() => {
    debouncedScheduleRefresh();
  });

  const titleElement = document.querySelector("title");

  if (titleElement) {
    observer.observe(titleElement, {
      characterData: true,
      childList: true,
      subtree: true
    });
  }

  const observeStreamTitle = (): void => {
    const streamTitle = document.querySelector('[data-a-target="stream-title"]');

    if (streamTitle) {
      observer.observe(streamTitle, {
        characterData: true,
        childList: true,
        subtree: true
      });
    }
  };

  observeStreamTitle();

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  return () => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }

    observer.disconnect();
  };
}
