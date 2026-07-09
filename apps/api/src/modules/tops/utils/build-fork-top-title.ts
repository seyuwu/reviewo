import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";

export const MAX_TOP_TITLE_LENGTH = 200;

export function resolveForkAuthorLabel(
  user: Pick<AuthenticatedUser, "displayName" | "username">
): string {
  const username = user.username?.trim();

  if (username) {
    return username;
  }

  const displayName = user.displayName.trim();

  if (displayName) {
    return displayName;
  }

  return "user";
}

const LEGACY_FORK_TITLE_SUFFIX =
  /\s*\((?:моя версия|версия(?:\s*[-–—]\s*|\s+)[^)]+)\)\s*$/iu;

export function normalizeForkSourceTitle(title: string): string {
  let normalized = title.trim();

  while (LEGACY_FORK_TITLE_SUFFIX.test(normalized)) {
    normalized = normalized.replace(LEGACY_FORK_TITLE_SUFFIX, "").trim();
  }

  return normalized;
}

export function buildForkTopTitle(sourceTitle: string, forkerLabel: string): string {
  const suffix = ` (версия ${forkerLabel})`;
  const maxSourceLength = MAX_TOP_TITLE_LENGTH - suffix.length;

  if (maxSourceLength < 1) {
    return suffix.trim().slice(0, MAX_TOP_TITLE_LENGTH);
  }

  const baseTitle = normalizeForkSourceTitle(sourceTitle);
  const truncatedBase =
    baseTitle.length > maxSourceLength ? baseTitle.slice(0, maxSourceLength).trimEnd() : baseTitle;

  return `${truncatedBase}${suffix}`;
}
