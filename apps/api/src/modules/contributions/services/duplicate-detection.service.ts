import { Injectable } from "@nestjs/common";
import type { Entity } from "#prisma/client";

import { createSlugFromCanonicalUrl } from "../../entities/services/entity-slug.js";
import { DUPLICATE_SUGGESTION_LIMIT, DUPLICATE_SUGGESTION_MIN_SCORE } from "../constants/contribution-limits.js";
import { ContributionsRepository } from "../repositories/contributions.repository.js";
import { computeTitleTokenOverlap } from "../utils/title-match-tokens.js";
import { scoreTransliteratedTitleMatch } from "../../entities/utils/title-duplicate-match.js";

export interface DuplicateSuggestion {
  entity: {
    canonicalUrl: string | null;
    id: string;
    slug: string;
    title: string;
  };
  matchPercent: number;
  reasons: string[];
}

@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly contributionsRepository: ContributionsRepository) {}

  async findSuggestions(entityId: string): Promise<DuplicateSuggestion[]> {
    const source = await this.contributionsRepository.findEntityById(entityId);

    if (!source || source.visibility !== "ACTIVE") {
      return [];
    }

    const candidates = await this.contributionsRepository.findDuplicateCandidates(entityId, source.title);
    const scored = candidates
      .map((candidate) => scoreDuplicatePair(source, candidate))
      .filter((item) => item.matchPercent / 100 >= DUPLICATE_SUGGESTION_MIN_SCORE)
      .sort((left, right) => right.matchPercent - left.matchPercent)
      .slice(0, DUPLICATE_SUGGESTION_LIMIT);

    return scored;
  }
}

export function scoreDuplicatePair(
  left: Entity,
  right: Entity
): DuplicateSuggestion {
  let score = 0;
  const reasons: string[] = [];

  if (normalizeTitle(left.title) === normalizeTitle(right.title)) {
    score += 0.5;
    reasons.push("title_match");
  } else {
    const transliteratedMatch = scoreTransliteratedTitleMatch(left.title, right.title);

    if (transliteratedMatch.reason && transliteratedMatch.score > 0) {
      score += transliteratedMatch.score;
      reasons.push(transliteratedMatch.reason);
    }

    const tokenOverlap = computeTitleTokenOverlap(left.title, right.title);

    if (tokenOverlap.shorterCoverage === 1 && tokenOverlap.shorterTokenCount >= 2) {
      score += 0.75;
      reasons.push("title_tokens_subset");
    } else if (tokenOverlap.jaccard >= 0.5) {
      score += 0.35;
      reasons.push("title_token_overlap");
    } else if (tokenOverlap.jaccard >= 0.35) {
      score += 0.25;
      reasons.push("title_token_overlap");
    }
  }

  if (
    left.canonicalUrl &&
    right.canonicalUrl &&
    left.canonicalUrl === right.canonicalUrl
  ) {
    score += 0.4;
    reasons.push("canonical_url_match");
  } else if (left.canonicalUrl && !right.canonicalUrl) {
    const expectedSlug = createSlugFromCanonicalUrl(left.canonicalUrl);

    if (right.slug === expectedSlug || normalizeTitle(right.title) === hostnameFromUrl(left.canonicalUrl)) {
      score += 0.4;
      reasons.push("url_title_alignment");
    }
  } else if (right.canonicalUrl && !left.canonicalUrl) {
    const expectedSlug = createSlugFromCanonicalUrl(right.canonicalUrl);

    if (left.slug === expectedSlug || normalizeTitle(left.title) === hostnameFromUrl(right.canonicalUrl)) {
      score += 0.4;
      reasons.push("url_title_alignment");
    }
  }

  if (left.slug === right.slug) {
    score += 0.3;
    reasons.push("slug_match");
  } else if (left.canonicalUrl && right.slug === createSlugFromCanonicalUrl(left.canonicalUrl)) {
    score += 0.3;
    reasons.push("slug_from_url");
  } else if (right.canonicalUrl && left.slug === createSlugFromCanonicalUrl(right.canonicalUrl)) {
    score += 0.3;
    reasons.push("slug_from_url");
  }

  if (!left.canonicalUrl && !right.canonicalUrl) {
    const similarity = fuzzyTitleSimilarity(left.title, right.title);

    if (similarity > 0.85) {
      score += 0.2;
      reasons.push("fuzzy_title");
    }
  } else if (normalizeTitle(left.title) !== normalizeTitle(right.title)) {
    const similarity = fuzzyTitleSimilarity(left.title, right.title);
    const tokenOverlap = computeTitleTokenOverlap(left.title, right.title);

    if (similarity > 0.85 || (similarity > 0.6 && tokenOverlap.jaccard >= 0.35)) {
      score += 0.15;
      reasons.push("fuzzy_title");
    }
  }

  return {
    entity: {
      canonicalUrl: right.canonicalUrl,
      id: right.id,
      slug: right.slug,
      title: right.title
    },
    matchPercent: Math.min(100, Math.round(score * 100)),
    reasons
  };
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hostnameFromUrl(canonicalUrl: string): string {
  try {
    return new URL(canonicalUrl).hostname.toLowerCase();
  } catch {
    return canonicalUrl.toLowerCase();
  }
}

function fuzzyTitleSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeTitle(left);
  const normalizedRight = normalizeTitle(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const longer =
    normalizedLeft.length >= normalizedRight.length ? normalizedLeft : normalizedRight;
  const shorter =
    normalizedLeft.length < normalizedRight.length ? normalizedLeft : normalizedRight;

  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }

  return 0;
}
