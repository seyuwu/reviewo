import { clamp, roundToThreeDecimals } from "../utils/reputation-math.js";
import type { EntityConfidenceHardCapCode } from "../utils/entity-confidence-hard-caps.js";

export type ReliabilityLevel = "very_high" | "high" | "medium" | "low";

export interface EntityTrustFactorInput {
  anomalyFactor: number;
  anomalyScore: number;
  appliedHardCaps: EntityConfidenceHardCapCode[];
  durationFactor: number;
  massFactor: number;
  uniqueRatio: number;
  uniqueRatioFactor: number;
  uniqueUsersFactor: number;
  varianceFactor: number;
}

export interface EntityTrustScoresResult {
  confidenceScore: number;
  dataReliability: number;
  manipulationRisk: number;
  reliabilityLevel: ReliabilityLevel;
}

export function calculateEntityTrustScores(input: {
  confidenceScore: number;
  factors: EntityTrustFactorInput;
}): EntityTrustScoresResult {
  const dataReliability = roundToThreeDecimals(
    clamp(
      0.32 * input.factors.massFactor +
        0.16 * input.factors.uniqueUsersFactor +
        0.16 * input.factors.uniqueRatioFactor +
        0.22 * input.factors.durationFactor +
        0.14 * input.factors.varianceFactor,
      0,
      1
    )
  );
  const manipulationRisk = roundToThreeDecimals(
    clamp(
      0.45 * (1 - input.factors.anomalyFactor) +
        0.35 * (1 - input.factors.uniqueRatioFactor) +
        0.2 * Math.min(1, input.factors.appliedHardCaps.length / 2),
      0,
      1
    )
  );

  return {
    confidenceScore: input.confidenceScore,
    dataReliability,
    manipulationRisk,
    reliabilityLevel: resolveReliabilityLevel(input.confidenceScore)
  };
}

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
