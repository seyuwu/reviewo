const MAX_LAZY_ENTITY_TITLE_LENGTH = 200;

export function sanitizeLazyEntityTitle(
  sourceTitle: string | undefined,
  canonicalUrl: string
): string {
  const normalizedSourceTitle = sourceTitle?.trim().replace(/\s+/g, " ");

  if (normalizedSourceTitle) {
    return normalizedSourceTitle.slice(0, MAX_LAZY_ENTITY_TITLE_LENGTH);
  }

  return deriveTitleFromCanonicalUrl(canonicalUrl);
}

export function deriveTitleFromCanonicalUrl(canonicalUrl: string): string {
  const url = new URL(canonicalUrl);

  return url.hostname;
}
