import { readPageIdentity } from "../../shared/page-identity.js";
import { isYouTubePage } from "./read-page-title.js";

export function readYouTubeVideoIdFromPageUrl(pageUrl: string): string | null {
  const identity = readPageIdentity(pageUrl);

  if (!identity?.startsWith("youtube:video:")) {
    return null;
  }

  return identity.slice("youtube:video:".length);
}

export function isGenericYouTubeTitle(title: string): boolean {
  const normalizedTitle = title.trim().toLowerCase();

  if (!normalizedTitle || normalizedTitle === "youtube") {
    return true;
  }

  const withoutSuffix = normalizedTitle.replace(/\s*-\s*youtube\s*$/i, "").trim();

  return withoutSuffix.length === 0;
}

export function readYouTubeOgUrl(): string | undefined {
  return readMetaContent('meta[property="og:url"]');
}

export function doesYouTubeMetadataMatchVideo(videoId: string): boolean {
  const ogUrl = readYouTubeOgUrl();

  if (ogUrl?.includes(videoId)) {
    return true;
  }

  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.getAttribute("href");

  if (canonicalUrl?.includes(videoId)) {
    return true;
  }

  return false;
}

export function isYouTubeOgUrlStillOnVideoPage(ogUrl: string): boolean {
  try {
    const ogPath = new URL(ogUrl).pathname;

    return (
      ogPath === "/watch" ||
      ogPath.startsWith("/shorts/") ||
      ogPath.startsWith("/live/")
    );
  } catch {
    return false;
  }
}

export function isYouTubeVideoPageUrl(pageUrl: string): boolean {
  return isYouTubePage(pageUrl) && readYouTubeVideoIdFromPageUrl(pageUrl) !== null;
}

function readMetaContent(selector: string): string | undefined {
  const content = document.querySelector(selector)?.getAttribute("content")?.trim();

  if (!content) {
    return undefined;
  }

  return content;
}
