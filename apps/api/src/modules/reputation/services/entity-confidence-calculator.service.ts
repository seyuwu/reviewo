import { Injectable } from "@nestjs/common";

import type { ConfidenceReason } from "../types/confidence-reason.types.js";
import {
  calculateEntityConfidenceHardCap,
  type EntityConfidenceHardCapCode
} from "../utils/entity-confidence-hard-caps.js";
import { clamp, roundToThreeDecimals } from "../utils/reputation-math.js";
import {
  calculateEntityTrustScores,
  type ReliabilityLevel
} from "./entity-trust-scores-calculator.service.js";

export interface EntityConfidenceInput {
  activityDurationDays: number;
  anomalyScore: number;
  coordinationExposureShare?: number;
  effectiveVoteMass: number;
  newAccountShare?: number;
  platformUserCount?: number;
  scoreVariance: number;
  uniqueRatersCount: number;
  votesCount: number;
}

export interface EntityConfidenceResult {
  appliedHardCaps: EntityConfidenceHardCapCode[];
  confidenceScore: number;
  dataReliability: number;
  explanation: ConfidenceReason[];
  manipulationRisk: number;
  reliabilityLevel: ReliabilityLevel;
  uniqueRatio: number;
}

@Injectable()
export class EntityConfidenceCalculator {
  calculate(input: EntityConfidenceInput): EntityConfidenceResult {
    const massFactor = Math.min(1, input.effectiveVoteMass / 50);
    const uniqueUsersFactor = Math.min(1, input.uniqueRatersCount / 20);
    const hardCapResult = calculateEntityConfidenceHardCap({
      anomalyScore: input.anomalyScore,
      uniqueRatersCount: input.uniqueRatersCount,
      votesCount: input.votesCount,
      ...(input.coordinationExposureShare !== undefined
        ? { coordinationExposureShare: input.coordinationExposureShare }
        : {}),
      ...(input.newAccountShare !== undefined ? { newAccountShare: input.newAccountShare } : {}),
      ...(input.platformUserCount !== undefined ? { platformUserCount: input.platformUserCount } : {})
    });
    const durationFactor = Math.min(1, input.activityDurationDays / 365);
    const varianceFactor = 1 - Math.min(1, input.scoreVariance / 2);
    const anomalyFactor = 1 - clamp(input.anomalyScore, 0, 1);
    const rawConfidenceScore =
      0.3 * massFactor +
      0.15 * uniqueUsersFactor +
      0.15 * hardCapResult.uniqueRatioFactor +
      0.2 * durationFactor +
      0.1 * varianceFactor +
      0.1 * anomalyFactor;
    const confidenceScore = roundToThreeDecimals(
      clamp(Math.min(rawConfidenceScore, hardCapResult.hardCap), 0, 1)
    );
    const trustScores = calculateEntityTrustScores({
      confidenceScore,
      factors: {
        anomalyFactor,
        anomalyScore: input.anomalyScore,
        appliedHardCaps: hardCapResult.appliedCaps,
        durationFactor,
        massFactor,
        uniqueRatio: hardCapResult.uniqueRatio,
        uniqueRatioFactor: hardCapResult.uniqueRatioFactor,
        uniqueUsersFactor,
        varianceFactor
      }
    });

    return {
      appliedHardCaps: hardCapResult.appliedCaps,
      confidenceScore: trustScores.confidenceScore,
      dataReliability: trustScores.dataReliability,
      explanation: buildExplanation({
        activityDurationDays: input.activityDurationDays,
        anomalyFactor,
        anomalyScore: input.anomalyScore,
        appliedHardCaps: hardCapResult.appliedCaps,
        durationFactor,
        effectiveVoteMass: input.effectiveVoteMass,
        hardCap: hardCapResult.hardCap,
        massFactor,
        uniqueRatersCount: input.uniqueRatersCount,
        uniqueRatio: hardCapResult.uniqueRatio,
        uniqueRatioFactor: hardCapResult.uniqueRatioFactor,
        uniqueUsersFactor,
        varianceFactor
      }),
      manipulationRisk: trustScores.manipulationRisk,
      reliabilityLevel: trustScores.reliabilityLevel,
      uniqueRatio: hardCapResult.uniqueRatio
    };
  }
}

function buildExplanation(input: {
  activityDurationDays: number;
  anomalyFactor: number;
  anomalyScore: number;
  appliedHardCaps: EntityConfidenceHardCapCode[];
  durationFactor: number;
  effectiveVoteMass: number;
  hardCap: number;
  massFactor: number;
  uniqueRatersCount: number;
  uniqueRatio: number;
  uniqueRatioFactor: number;
  uniqueUsersFactor: number;
  varianceFactor: number;
}): ConfidenceReason[] {
  const reasons: ConfidenceReason[] = [
    {
      code: "WEIGHTED_VOTES",
      impact: input.massFactor >= 0.5 ? "positive" : "neutral",
      label: `${Math.round(input.effectiveVoteMass)} weighted votes`,
      weight: 0.3
    },
    {
      code: "UNIQUE_USERS",
      impact: input.uniqueUsersFactor >= 0.5 ? "positive" : "neutral",
      label: `${input.uniqueRatersCount} unique users`,
      weight: 0.15
    },
    {
      code: "UNIQUE_RATIO",
      impact: input.uniqueRatioFactor >= 0.5 ? "positive" : "negative",
      label: `${Math.round(input.uniqueRatio * 100)}% unique raters`,
      weight: 0.15
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

  if (input.appliedHardCaps.length > 0) {
    reasons.push({
      code: "HARD_CAP_APPLIED",
      impact: "negative",
      label: `Hard cap applied at ${Math.round(input.hardCap * 100)}% (${input.appliedHardCaps.join(", ")})`,
      weight: 0
    });
  }

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
