import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";

export function formatAverageScore(avgScore: number): string {
  return avgScore.toFixed(1);
}

export function formatVotesCount(votesCount: number): string {
  return votesCount === 1 ? "1 rating" : `${votesCount} ratings`;
}

export function hasEntityRatings(votesCount: number): boolean {
  return votesCount > 0;
}

export function formatRatingStatsLine(avgScore: number, votesCount: number): string {
  if (!hasEntityRatings(votesCount)) {
    return "No ratings yet · Be the first to rate";
  }

  return `${formatAverageScore(avgScore)} / 5 · ${formatVotesCount(votesCount)}`;
}

export function formatTrustConfidence(confidence: number): string {
  const percentage = Math.round(confidence * 100);

  return `Trust ${percentage}%`;
}

export function buildRatingCardSummary(response: ExtensionResolveFoundResponse): {
  averageScoreLabel: string;
  entityTitle: string;
  hasRatings: boolean;
  metaLabel: string;
} {
  const hasRatings = hasEntityRatings(response.rating.votesCount);

  return {
    averageScoreLabel: hasRatings ? formatAverageScore(response.rating.avgScore) : "—",
    entityTitle: response.entity.title,
    hasRatings,
    metaLabel: hasRatings
      ? `${formatVotesCount(response.rating.votesCount)} · ${formatTrustConfidence(response.trust.confidence)}`
      : "No ratings yet · Be the first to rate"
  };
}
