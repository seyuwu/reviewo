import { isGamesVerticalHostname } from "../../../lib/config/product-hosts";

/** Path-based Games chrome (local same-origin `/games` + `/dota`). */
export function isGamesModePath(pathname: string): boolean {
  return pathname === "/games" || pathname.startsWith("/games/") || pathname.startsWith("/dota");
}

/**
 * Product chrome mode: Games paths always, plus any path on games/dota hosts
 * so `/profile` login stays in Games UI on `games.opinia.ru`.
 */
export function isGamesProductMode(pathname: string, hostname?: string | null): boolean {
  if (isGamesModePath(pathname)) {
    return true;
  }

  if (hostname && isGamesVerticalHostname(hostname)) {
    return true;
  }

  return false;
}

/**
 * Safe same-origin relative path for post-login `?next=`.
 * Rejects open redirects (`//evil`, `https://…`, backslashes, etc.).
 */
export function safeInternalNextPath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return null;
  }

  if (trimmed.includes("://") || trimmed.includes("\\") || trimmed.includes("@")) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(trimmed);

    if (
      !decoded.startsWith("/") ||
      decoded.startsWith("//") ||
      decoded.includes("://") ||
      decoded.includes("\\")
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const withoutHash = trimmed.split("#")[0] ?? trimmed;
  return withoutHash.length > 0 ? withoutHash : null;
}
