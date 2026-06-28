import { Injectable } from "@nestjs/common";

import type { ConfidenceReason } from "../types/confidence-reason.types.js";
import { clamp, roundToThreeDecimals } from "../utils/reputation-math.js";

export interface EntityConfidenceInput {
  activityDurationDays: number;
  anomalyScore: number;
  effectiveVoteMass: number;
  scoreVariance: number;
  uniqueRatersCount: number;
}

export interface EntityConfidenceResult {
  confidenceScore: number;
  explanation: ConfidenceReason[];
}

@Injectable()
export class EntityConfidenceCalculator {
  calculate(input: EntityConfidenceInput): EntityConfidenceResult {
    const massFactor = Math.min(1, input.effectiveVoteMass / 50);
    const uniqueUsersFactor = Math.min(1, input.uniqueRatersCount / 20);
    const durationFactor = Math.min(1, input.activityDurationDays / 365);
    const varianceFactor = 1 - Math.min(1, input.scoreVariance / 2);
    const anomalyFactor = 1 - clamp(input.anomalyScore, 0, 1);

    const confidenceScore = roundToThreeDecimals(
      clamp(
        0.35 * massFactor +
          0.25 * uniqueUsersFactor +
          0.2 * durationFactor +
          0.1 * varianceFactor +
          0.1 * anomalyFactor,
        0,
        1
      )
    );

    return {
      confidenceScore,
      explanation: buildExplanation({
        activityDurationDays: input.activityDurationDays,
        anomalyScore: input.anomalyScore,
        anomalyFactor,
        durationFactor,
        effectiveVoteMass: input.effectiveVoteMass,
        massFactor,
        uniqueRatersCount: input.uniqueRatersCount,
        uniqueUsersFactor,
        varianceFactor
      })
    };
  }
}

function buildExplanation(input: {
  activityDurationDays: number;
  anomalyFactor: number;
  anomalyScore: number;
  durationFactor: number;
  effectiveVoteMass: number;
  massFactor: number;
  uniqueRatersCount: number;
  uniqueUsersFactor: number;
  varianceFactor: number;
}): ConfidenceReason[] {
  const reasons: ConfidenceReason[] = [
    {
      code: "WEIGHTED_VOTES",
      impact: input.massFactor >= 0.5 ? "positive" : "neutral",
      label: `${Math.round(input.effectiveVoteMass)} weighted votes`,
      weight: 0.35
    },
    {
      code: "UNIQUE_USERS",
      impact: input.uniqueUsersFactor >= 0.5 ? "positive" : "neutral",
      label: `${input.uniqueRatersCount} unique users`,
      weight: 0.25
    },
    {
      code: "HISTORY",
      impact: input.durationFactor >= 0.25 ? "positive" : "neutral",
      label: formatHistoryLabel(input.activityDurationDays),
      weight: 0.2
    },
    {
      code: "VARIANCE",
      impact: input.varianceFactor >= 0.5 ? "positive" : "neutral",
      label: "Stable score distribution",
      weight: 0.1
    },
    {
      code: input.anomalyScore <= 0.2 ? "LOW_ANOMALY" : "ELEVATED_ANOMALY",
      impact: input.anomalyFactor >= 0.8 ? "positive" : "negative",
      label:
        input.anomalyScore <= 0.2 ? "Low anomaly score" : "Elevated anomaly signals detected",
      weight: 0.1
    }
  ];

  return reasons;
}

function formatHistoryLabel(activityDurationDays: number): string {
  if (activityDurationDays >= 365) {
    const years = Math.floor(activityDurationDays / 365);

    return years === 1 ? "1 year history" : `${years} years history`;
  }

  if (activityDurationDays === 0) {
    return "No rating history yet";
  }

  return `${activityDurationDays} days history`;
}
