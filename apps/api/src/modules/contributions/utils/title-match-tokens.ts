const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "or",
  "the",
  "to",
  "в",
  "и",
  "из",
  "на",
  "по",
  "с"
]);

const MAX_SEARCH_TOKENS = 5;

export interface TitleTokenOverlap {
  jaccard: number;
  shorterCoverage: number;
  shorterTokenCount: number;
}

export function extractTitleTokens(title: string): string[] {
  const normalized = title
    .toLowerCase()
    .replace(/[|/\\–—\-_:]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim();

  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      if (STOP_WORDS.has(token)) {
        return false;
      }

      if (/^\d+$/.test(token)) {
        return token.length >= 2;
      }

      return token.length >= 2;
    });

  return [...new Set(tokens)];
}

export function pickTitleSearchTokens(title: string): string[] {
  return [...extractTitleTokens(title)]
    .sort((left, right) => right.length - left.length)
    .slice(0, MAX_SEARCH_TOKENS);
}

export function computeTitleTokenOverlap(leftTitle: string, rightTitle: string): TitleTokenOverlap {
  const leftTokens = extractTitleTokens(leftTitle);
  const rightTokens = extractTitleTokens(rightTitle);
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);

  if (leftSet.size === 0 || rightSet.size === 0) {
    return {
      jaccard: 0,
      shorterCoverage: 0,
      shorterTokenCount: 0
    };
  }

  const intersectionSize = [...leftSet].filter((token) => rightSet.has(token)).length;
  const unionSize = new Set([...leftSet, ...rightSet]).size;
  const jaccard = intersectionSize / unionSize;

  const [shorterSet, longerSet] =
    leftSet.size <= rightSet.size ? [leftSet, rightSet] : [rightSet, leftSet];
  const matchedCount = [...shorterSet].filter((token) => longerSet.has(token)).length;

  return {
    jaccard,
    shorterCoverage: matchedCount / shorterSet.size,
    shorterTokenCount: shorterSet.size
  };
}
