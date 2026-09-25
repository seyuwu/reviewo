/** Formats a 0-5 review score with two decimals (e.g. "4.25"). */
export function formatScore(score: number): string {
  return score.toFixed(2);
}

/** Formats a 0-5 review score with one decimal (e.g. "4.3"). */
export function formatScoreOneDecimal(score: number): string {
  return score.toFixed(1);
}
