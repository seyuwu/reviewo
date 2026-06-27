import { readCurrentPageUrl } from "./page-url.js";

export function readPageIdentity(pageUrl: string = readCurrentPageUrl()): string | null {
  try {
    const parsed = new URL(pageUrl);
    const hostname = normalizeHostname(parsed.hostname);

    const youTubeVideoId = readYouTubeVideoId(parsed, hostname);

    if (youTubeVideoId) {
      return `youtube:video:${youTubeVideoId}`;
    }

    const twitchIdentity = readTwitchIdentity(parsed, hostname);

    if (twitchIdentity) {
      return twitchIdentity;
    }

    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function readYouTubeVideoId(parsed: URL, hostname: string): string | null {
  if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname)) {
    if (hostname === "youtu.be") {
      const shortId = parsed.pathname.split("/").filter(Boolean)[0];

      return shortId ?? null;
    }

    return null;
  }

  if (parsed.pathname === "/watch") {
    return parsed.searchParams.get("v");
  }

  if (parsed.pathname.startsWith("/shorts/")) {
    return parsed.pathname.split("/").filter(Boolean)[1] ?? null;
  }

  if (parsed.pathname.startsWith("/live/")) {
    return parsed.pathname.split("/").filter(Boolean)[1] ?? null;
  }

  return null;
}

function readTwitchIdentity(parsed: URL, hostname: string): string | null {
  if (hostname !== "twitch.tv") {
    return null;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);

  if (parts[0] === "videos" && parts[1]) {
    return `twitch:video:${parts[1]}`;
  }

  if (parts.length > 0 && parts[0] !== "directory") {
    return `twitch:channel:${parts[0]}`;
  }

  return null;
}
