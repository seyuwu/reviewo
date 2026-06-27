import {
  doesYouTubeMetadataMatchVideo,
  isGenericYouTubeTitle,
  isYouTubeOgUrlStillOnVideoPage,
  readYouTubeOgUrl,
  readYouTubeVideoIdFromPageUrl
} from "./youtube-page-state.js";

const MAX_PAGE_TITLE_LENGTH = 200;

export function normalizePageSourceTitle(title: string): string {
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  const withoutYouTubeSuffix = normalizedTitle.replace(/\s*-\s*YouTube\s*$/i, "").trim();

  return (withoutYouTubeSuffix || normalizedTitle).slice(0, MAX_PAGE_TITLE_LENGTH);
}

export function readPageSourceTitle(pageUrl: string = window.location.href): string | undefined {
  if (isTwitchPage(pageUrl)) {
    return readTwitchPageTitle(pageUrl) ?? readDocumentTitle();
  }

  if (isYouTubePage(pageUrl)) {
    return readYouTubePageTitle(pageUrl);
  }

  return readDocumentTitle();
}

function readYouTubePageTitle(pageUrl: string): string | undefined {
  const videoId = readYouTubeVideoIdFromPageUrl(pageUrl);

  if (videoId) {
    if (!doesYouTubeMetadataMatchVideo(videoId)) {
      return undefined;
    }

    const ogTitle = readMetaContent('meta[property="og:title"]');

    if (ogTitle && !isGenericYouTubeTitle(ogTitle)) {
      return normalizePageSourceTitle(ogTitle);
    }

    const documentTitle = document.title.trim().replace(/\s+/g, " ");

    if (documentTitle && !isGenericYouTubeTitle(documentTitle)) {
      return normalizePageSourceTitle(documentTitle);
    }

    return undefined;
  }

  const ogUrl = readYouTubeOgUrl();

  if (ogUrl && isYouTubeOgUrlStillOnVideoPage(ogUrl)) {
    return undefined;
  }

  const documentTitle = document.title.trim().replace(/\s+/g, " ");

  if (documentTitle && !isGenericYouTubeTitle(documentTitle)) {
    return undefined;
  }

  return readDocumentTitle();
}

function readDocumentTitle(): string | undefined {
  const normalizedTitle = document.title.trim().replace(/\s+/g, " ");

  if (!normalizedTitle || isGenericTwitchTitle(normalizedTitle)) {
    return undefined;
  }

  return normalizePageSourceTitle(normalizedTitle);
}

function readTwitchPageTitle(pageUrl: string): string | undefined {
  const streamTitle = readTextContent('[data-a-target="stream-title"]');

  if (streamTitle) {
    return normalizePageSourceTitle(streamTitle);
  }

  const ogTitle = readMetaContent('meta[property="og:title"]');

  if (ogTitle && !isGenericTwitchTitle(ogTitle)) {
    return normalizePageSourceTitle(ogTitle);
  }

  const clipTitle = readTextContent('[data-a-target="clip-title"]');

  if (clipTitle) {
    return normalizePageSourceTitle(clipTitle);
  }

  const documentTitle = document.title.trim().replace(/\s+/g, " ");

  if (documentTitle && !isGenericTwitchTitle(documentTitle)) {
    return normalizePageSourceTitle(documentTitle);
  }

  const channelTitle = readTwitchChannelLabel(pageUrl);

  if (channelTitle) {
    return normalizePageSourceTitle(channelTitle);
  }

  return ogTitle ? normalizePageSourceTitle(ogTitle) : undefined;
}

function readTwitchChannelLabel(pageUrl: string): string | undefined {
  const displayName = readTextContent('[data-a-target="stream-display-name"]');

  if (displayName) {
    return displayName;
  }

  try {
    const parts = new URL(pageUrl).pathname.split("/").filter(Boolean);

    if (parts.length === 0 || !parts[0] || parts[0] === "directory" || parts[0] === "videos") {
      return undefined;
    }

    return formatChannelSlug(parts[0]);
  } catch {
    return undefined;
  }
}

function readTextContent(selector: string): string | undefined {
  const element = document.querySelector(selector);
  const text = element?.textContent?.trim().replace(/\s+/g, " ");

  if (!text) {
    return undefined;
  }

  return text.slice(0, MAX_PAGE_TITLE_LENGTH);
}

function readMetaContent(selector: string): string | undefined {
  const content = document.querySelector(selector)?.getAttribute("content")?.trim().replace(/\s+/g, " ");

  if (!content) {
    return undefined;
  }

  return content.slice(0, MAX_PAGE_TITLE_LENGTH);
}

function formatChannelSlug(slug: string): string {
  return slug.replaceAll("-", " ");
}

export function isTwitchPage(pageUrl: string): boolean {
  try {
    return new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "").endsWith("twitch.tv");
  } catch {
    return false;
  }
}

export function isYouTubePage(pageUrl: string): boolean {
  try {
    const hostname = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, "");

    return (
      ["youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname) ||
      hostname === "youtu.be"
    );
  } catch {
    return false;
  }
}

export function isGenericTwitchTitle(title: string): boolean {
  const normalizedTitle = title.trim().toLowerCase();

  return normalizedTitle === "twitch" || normalizedTitle === "twitch.tv";
}
