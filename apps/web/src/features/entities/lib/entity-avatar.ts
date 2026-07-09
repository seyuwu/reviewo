export type EntityAvatarSize = "sm" | "md" | "lg";

const AVATAR_SIZE_PX: Record<EntityAvatarSize, number> = {
  sm: 32,
  md: 44,
  lg: 64
};

export function isSafeImageSrc(value: string | null | undefined): value is string {
  if (!value?.trim()) {
    return false;
  }

  try {
    const url = new URL(value.trim());

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveEntityAvatarCandidates(
  logoUrl: string | null | undefined,
  canonicalUrl: string | null | undefined,
  size: EntityAvatarSize = "md"
): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const push = (url: string | null | undefined) => {
    if (!isSafeImageSrc(url)) {
      return;
    }

    const normalized = url.trim();

    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    candidates.push(normalized);
  };

  push(logoUrl);

  if (!canonicalUrl) {
    return candidates;
  }

  try {
    const parsed = new URL(canonicalUrl);
    const origin = parsed.origin;
    const hostname = parsed.hostname;
    const iconSize = AVATAR_SIZE_PX[size] >= 48 ? 128 : 64;

    push(`${origin}/apple-touch-icon.png`);
    push(`${origin}/apple-touch-icon-precomposed.png`);
    push(
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=${iconSize}`
    );
    push(`${origin}/favicon.svg`);
    push(`${origin}/favicon.ico`);
  } catch {
    return candidates;
  }

  return candidates;
}

/** @deprecated Use resolveEntityAvatarCandidates and pick the first candidate. */
export function resolveEntityAvatarSrc(
  logoUrl: string | null | undefined,
  canonicalUrl?: string | null
): string | null {
  return resolveEntityAvatarCandidates(logoUrl, canonicalUrl)[0] ?? null;
}

export function getEntityInitials(title: string, canonicalUrl?: string | null): string {
  const hostnameInitials = readHostnameInitials(canonicalUrl);

  if (hostnameInitials) {
    return hostnameInitials;
  }

  const words = title
    .trim()
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));

  if (words.length === 0) {
    return "?";
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}

export function getEntityAvatarColor(seed: string): string {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;

  return `hsl(${hue} 45% 42%)`;
}

function readHostnameInitials(canonicalUrl: string | null | undefined): string | null {
  if (!canonicalUrl) {
    return null;
  }

  try {
    const hostname = new URL(canonicalUrl).hostname.replace(/^www\./, "");
    const labels = hostname.split(".").filter(Boolean);

    if (labels.length === 0) {
      return null;
    }

    if (labels.length >= 3 && labels[0]!.length === 2) {
      return labels[0]!.slice(0, 2).toUpperCase();
    }

    const baseLabel = labels[0] ?? hostname;

    return baseLabel.slice(0, 2).toUpperCase();
  } catch {
    return null;
  }
}
