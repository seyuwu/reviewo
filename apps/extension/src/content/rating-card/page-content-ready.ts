import { readPageIdentity } from "../../shared/page-identity.js";
import { readCurrentPageUrl } from "../../shared/page-url.js";
import { isTwitchPage, isYouTubePage, readPageSourceTitle } from "./read-page-title.js";
import {
  doesYouTubeMetadataMatchVideo,
  isGenericYouTubeTitle,
  isYouTubeOgUrlStillOnVideoPage,
  isYouTubeVideoPageUrl,
  readYouTubeOgUrl,
  readYouTubeVideoIdFromPageUrl
} from "./youtube-page-state.js";

const DEFAULT_NAVIGATION_SETTLE_DELAYS_MS = [300, 600, 1000] as const;
const YOUTUBE_NAVIGATION_SETTLE_DELAYS_MS = [800, 1600, 2800, 4000] as const;
const TWITCH_NAVIGATION_SETTLE_DELAYS_MS = [400, 800, 1500, 2500] as const;
const CONTENT_READY_POLL_INTERVAL_MS = 100;
const CONTENT_READY_DEADLINE_BUFFER_MS = 800;

export function getNavigationSettleDelaysMs(pageUrl: string): readonly number[] {
  if (isYouTubePage(pageUrl)) {
    return YOUTUBE_NAVIGATION_SETTLE_DELAYS_MS;
  }

  if (isTwitchPage(pageUrl)) {
    return TWITCH_NAVIGATION_SETTLE_DELAYS_MS;
  }

  return DEFAULT_NAVIGATION_SETTLE_DELAYS_MS;
}

export function isPageContentReadyForCard(pageUrl: string = readCurrentPageUrl()): boolean {
  if (document.readyState === "loading") {
    return false;
  }

  if (isYouTubePage(pageUrl)) {
    return isYouTubePageReady(pageUrl);
  }

  if (isTwitchPage(pageUrl)) {
    return Boolean(readPageSourceTitle(pageUrl));
  }

  return true;
}

export async function waitForPageContentReady(
  pageUrl: string,
  shouldContinue: () => boolean = () => true
): Promise<boolean> {
  const delays = getNavigationSettleDelaysMs(pageUrl);
  const maxDelayMs = delays.length > 0 ? Math.max(...delays) : 500;
  const deadlineMs = Date.now() + maxDelayMs + CONTENT_READY_DEADLINE_BUFFER_MS;
  const expectedIdentity = readPageIdentity(pageUrl);

  while (Date.now() < deadlineMs) {
    if (!shouldContinue()) {
      return false;
    }

    if (expectedIdentity && readPageIdentity() !== expectedIdentity) {
      return false;
    }

    if (isPageContentReadyForCard(pageUrl)) {
      return shouldContinue();
    }

    await sleep(CONTENT_READY_POLL_INTERVAL_MS);
  }

  if (!shouldContinue()) {
    return false;
  }

  if (expectedIdentity && readPageIdentity() !== expectedIdentity) {
    return false;
  }

  return isPageContentReadyForCard(pageUrl);
}

function isYouTubePageReady(pageUrl: string): boolean {
  if (isYouTubeVideoPageUrl(pageUrl)) {
    return isYouTubeVideoPageReady(pageUrl);
  }

  return isYouTubeFeedPageReady();
}

function isYouTubeVideoPageReady(pageUrl: string): boolean {
  const videoId = readYouTubeVideoIdFromPageUrl(pageUrl);

  if (!videoId || !doesYouTubeMetadataMatchVideo(videoId)) {
    return false;
  }

  const pageTitle = readPageSourceTitle(pageUrl);

  return Boolean(pageTitle && !isGenericYouTubeTitle(pageTitle));
}

function isYouTubeFeedPageReady(): boolean {
  // Non-video YouTube pages resolve from the current URL. Stale og:title metadata from a
  // previous watch page must not block resolving the feed/home entity.
  return true;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}
