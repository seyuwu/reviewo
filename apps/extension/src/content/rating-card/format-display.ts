import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";

export function formatAverageScore(avgScore: number): string {
  return avgScore.toFixed(1);
}

export function formatVotesCount(votesCount: number): string {
  return votesCount === 1 ? "1 rating" : `${votesCount} ratings`;
}

export function formatTrustConfidence(confidence: number): string {
  const percentage = Math.round(confidence * 100);

  return `Trust ${percentage}%`;
}

export function buildRatingCardSummary(response: ExtensionResolveFoundResponse): {
  averageScoreLabel: string;
  entityTitle: string;
  metaLabel: string;
} {
  return {
    averageScoreLabel: formatAverageScore(response.rating.avgScore),
    entityTitle: response.entity.title,
    metaLabel: `${formatVotesCount(response.rating.votesCount)} · ${formatTrustConfidence(response.trust.confidence)}`
  };
}
