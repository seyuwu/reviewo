interface EntityDisplayNameSource {
  canonicalUrl: string | null;
  slug: string;
  title: string;
}

export function formatEntityDisplayName(entity: EntityDisplayNameSource): string {
  const hostname = readHostname(entity.canonicalUrl);

  if (hostname) {
    return hostname;
  }

  const shortTitle = shortenEntityTitle(entity.title);

  if (shortTitle) {
    return shortTitle;
  }

  return entity.slug;
}

export function formatEntityHeroTitle(entity: EntityDisplayNameSource): string {
  const shortTitle = shortenEntityTitle(entity.title);

  if (shortTitle) {
    return shortTitle;
  }

  const hostname = readHostname(entity.canonicalUrl);

  if (hostname) {
    return hostname;
  }

  return entity.slug;
}

function readHostname(canonicalUrl: string | null): string | null {
  if (!canonicalUrl) {
    return null;
  }

  try {
    return new URL(canonicalUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function shortenEntityTitle(title: string): string {
  const normalized = title.trim();

  if (!normalized) {
    return "";
  }

  const firstSegment = normalized.split(/\s[·•|]\s|\s-\s/)[0]?.trim() ?? normalized;

  if (firstSegment.length <= 36) {
    return firstSegment;
  }

  return `${firstSegment.slice(0, 33).trimEnd()}…`;
}
