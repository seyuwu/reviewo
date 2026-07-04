export function formatStarRating(score: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(score)));

  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

export function formatScoreOneDecimal(score: number): string {
  return score.toFixed(1);
}

export function formatTrustPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
