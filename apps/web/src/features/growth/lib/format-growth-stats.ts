export function formatStarRating(score: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(score)));

  return `${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}`;
}

export { formatScoreOneDecimal } from "../../../lib/format/format-score";

export function formatTrustPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
