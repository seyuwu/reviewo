const MAX_LAZY_ENTITY_TITLE_LENGTH = 200;

export function sanitizeLazyEntityTitle(
  sourceTitle: string | undefined,
  canonicalUrl: string
): string {
  const normalizedSourceTitle = normalizeLazySourceTitle(sourceTitle);

  if (normalizedSourceTitle) {
    return normalizedSourceTitle.slice(0, MAX_LAZY_ENTITY_TITLE_LENGTH);
  }

  return deriveTitleFromCanonicalUrl(canonicalUrl);
}

export function isGenericLazyEntityTitle(entityTitle: string, canonicalUrl: string): boolean {
  const normalizedTitle = entityTitle.trim().toLowerCase();

  if (!normalizedTitle) {
    return true;
  }

  const hostname = deriveTitleFromCanonicalUrl(canonicalUrl).toLowerCase();

  if (normalizedTitle === hostname || normalizedTitle === `www.${hostname}`) {
    return true;
  }

  const hostBase = hostname.split(".")[0];

  return Boolean(hostBase && normalizedTitle === hostBase);
}

function normalizeLazySourceTitle(sourceTitle: string | undefined): string | undefined {
  const normalizedSourceTitle = sourceTitle?.trim().replace(/\s+/g, " ");

  if (!normalizedSourceTitle) {
    return undefined;
  }

  const withoutYouTubeSuffix = normalizedSourceTitle.replace(/\s*-\s*YouTube\s*$/i, "").trim();

  return withoutYouTubeSuffix || normalizedSourceTitle;
}

export function deriveTitleFromCanonicalUrl(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);

  return url.hostname;
}
