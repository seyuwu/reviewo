import { createSlug } from "../services/entity-slug.js";

const MAX_LEVENSHTEIN_TITLE_SLUG_LENGTH = 32;
const STRONG_SIMILARITY_THRESHOLD = 0.85;
const MODERATE_SIMILARITY_THRESHOLD = 0.75;

export function titleSlugKey(title: string): string {
  return createSlug(title.trim());
}

export function levenshteinDistance(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
  const currentRow = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    currentRow[0] = leftIndex + 1;

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;

      currentRow[rightIndex + 1] = Math.min(
        (currentRow[rightIndex] ?? 0) + 1,
        (previousRow[rightIndex + 1] ?? 0) + 1,
        (previousRow[rightIndex] ?? 0) + substitutionCost
      );
    }

    for (let index = 0; index < previousRow.length; index += 1) {
      previousRow[index] = currentRow[index] ?? 0;
    }
  }

  return currentRow[right.length] ?? Math.max(left.length, right.length);
}

export function levenshteinSimilarity(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const maxLength = Math.max(left.length, right.length);

  if (maxLength === 0) {
    return 1;
  }

  return 1 - levenshteinDistance(left, right) / maxLength;
}

export function slugPrefixForDuplicateSearch(titleSlug: string): string | null {
  if (titleSlug.length < 4) {
    return null;
  }

  return titleSlug.slice(0, Math.max(4, titleSlug.length - 1));
}

export interface TransliteratedTitleMatch {
  reason: "transliterated_title_match" | "transliterated_title_similarity" | null;
  score: number;
  similarity: number;
}

export function scoreTransliteratedTitleMatch(leftTitle: string, rightTitle: string): TransliteratedTitleMatch {
  const leftSlug = titleSlugKey(leftTitle);
  const rightSlug = titleSlugKey(rightTitle);

  if (!leftSlug || !rightSlug) {
    return {
      reason: null,
      score: 0,
      similarity: 0
    };
  }

  if (leftSlug === rightSlug) {
    return {
      reason: "transliterated_title_match",
      score: 0.5,
      similarity: 1
    };
  }

  const maxSlugLength = Math.max(leftSlug.length, rightSlug.length);

  if (maxSlugLength > MAX_LEVENSHTEIN_TITLE_SLUG_LENGTH) {
    return {
      reason: null,
      score: 0,
      similarity: 0
    };
  }

  const similarity = levenshteinSimilarity(leftSlug, rightSlug);

  if (similarity >= STRONG_SIMILARITY_THRESHOLD) {
    return {
      reason: "transliterated_title_similarity",
      score: 0.75,
      similarity
    };
  }

  if (similarity >= MODERATE_SIMILARITY_THRESHOLD && maxSlugLength <= 24) {
    return {
      reason: "transliterated_title_similarity",
      score: 0.3,
      similarity
    };
  }

  return {
    reason: null,
    score: 0,
    similarity
  };
}
