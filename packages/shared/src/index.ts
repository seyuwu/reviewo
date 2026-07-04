export type ReliabilityLevel = "very_high" | "high" | "medium" | "low";

export function resolveReliabilityLevel(score: number): ReliabilityLevel {
  if (score >= 0.95) {
    return "very_high";
  }

  if (score >= 0.8) {
    return "high";
  }

  if (score >= 0.6) {
    return "medium";
  }

  return "low";
}

export function resolveManipulationRiskLevel(risk: number): ReliabilityLevel {
  if (risk >= 0.75) {
    return "low";
  }

  if (risk >= 0.5) {
    return "medium";
  }

  if (risk >= 0.25) {
    return "high";
  }

  return "very_high";
}
