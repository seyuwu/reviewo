import type { TranslateFn } from "@reviewo/i18n";
import { formatRatingVotesLabel } from "@reviewo/i18n";

import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";

export function formatAverageScore(avgScore: number): string {
  return avgScore.toFixed(1);
}

export function formatVotesCount(t: TranslateFn, votesCount: number): string {
  return formatRatingVotesLabel(t, votesCount);
}

export function hasEntityRatings(votesCount: number): boolean {
  return votesCount > 0;
}

export function formatRatingStatsLine(t: TranslateFn, avgScore: number, votesCount: number): string {
  if (!hasEntityRatings(votesCount)) {
    return t("rating.stats.empty");
  }

  return t("rating.stats.line", {
    avg: formatAverageScore(avgScore),
    votes: formatVotesCount(t, votesCount)
  });
}

export function formatTrustConfidence(t: TranslateFn, confidence: number): string {
  return t("rating.confidence", { percent: Math.round(confidence * 100) });
}

export function formatRatingReliability(t: TranslateFn, confidence: number): string {
  return formatTrustConfidence(t, confidence);
}

export function formatRatingStatsLineWithConfidence(
  t: TranslateFn,
  avgScore: number,
  votesCount: number,
  confidence: number
): string {
  const baseLine = formatRatingStatsLine(t, avgScore, votesCount);

  if (!hasEntityRatings(votesCount)) {
    return baseLine;
  }

  return `${baseLine} · ${formatRatingReliability(t, confidence)}`;
}

export function buildRatingCardSummary(
  t: TranslateFn,
  response: ExtensionResolveFoundResponse
): {
  averageScoreLabel: string;
  entityTitle: string;
  hasRatings: boolean;
  metaLabel: string;
} {
  const hasRatings = hasEntityRatings(response.rating.votesCount);

  return {
    averageScoreLabel: hasRatings ? formatAverageScore(response.rating.avgScore) : t("rating.noScore"),
    entityTitle: response.entity.title,
    hasRatings,
    metaLabel: hasRatings
      ? `${formatVotesCount(t, response.rating.votesCount)} · ${formatRatingReliability(t, response.trust.confidence)}`
      : t("rating.stats.empty")
  };
}

