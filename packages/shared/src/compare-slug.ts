const COMPARE_PAIR_SEPARATOR = "-vs-";

export interface ParsedCompareSlug {
  leftSlug: string;
  rightSlug: string;
}

export function parseCompareSlug(pairSlug: string): ParsedCompareSlug | null {
  const normalized = pairSlug.trim().toLowerCase();
  const separatorIndex = normalized.indexOf(COMPARE_PAIR_SEPARATOR);

  if (separatorIndex <= 0) {
    return null;
  }

  const leftSlug = normalized.slice(0, separatorIndex).trim();
  const rightSlug = normalized.slice(separatorIndex + COMPARE_PAIR_SEPARATOR.length).trim();

  if (!leftSlug || !rightSlug) {
    return null;
  }

  return { leftSlug, rightSlug };
}

export function buildCompareSlug(leftSlug: string, rightSlug: string): string {
  return `${leftSlug.trim().toLowerCase()}${COMPARE_PAIR_SEPARATOR}${rightSlug.trim().toLowerCase()}`;
}

export function buildPairKey(leftEntityId: string, rightEntityId: string): string {
  return [leftEntityId, rightEntityId].sort().join(":");
}
