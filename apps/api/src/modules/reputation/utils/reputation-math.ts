export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundToThreeDecimals(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateVariance(scores: number[]): number {
  if (scores.length === 0) {
    return 0;
  }

  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const squaredDiffs = scores.map((score) => (score - mean) ** 2);

  return squaredDiffs.reduce((sum, value) => sum + value, 0) / scores.length;
}

export function calculateHerfindahlIndex(counts: number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0);

  if (total === 0) {
    return 0;
  }

  return counts.reduce((sum, count) => {
    const share = count / total;

    return sum + share * share;
  }, 0);
}
