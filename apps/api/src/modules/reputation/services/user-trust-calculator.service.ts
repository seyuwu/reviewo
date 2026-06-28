import { Injectable } from "@nestjs/common";

import { calculateHerfindahlIndex, clamp, roundToThreeDecimals } from "../utils/reputation-math.js";

export interface UserTrustInput {
  accountCreatedAt: Date;
  anomalyPenalty: number;
  dailyRatingCounts: number[];
  entityRatingCounts: number[];
  hourlyRatingCounts?: number[];
  hourlyRatingUpdateCounts?: number[];
  ratingEditRatio?: number;
  reviewModeration?: {
    hiddenReviewsCount: number;
    reviewsCount: number;
  };
  scoreCounts: [number, number, number, number, number];
  totalRatings: number;
  uniqueEntityTypeCount: number;
  uniqueRootDomainCount: number;
  uniqueTypeParentPairCount: number;
}

export interface UserTrustResult {
  accountAgeBonus: number;
  anomalyPenalty: number;
  consensusScore: number;
  coverageScore: number;
  diversityScore: number;
  stabilityScore: number;
  trustScore: number;
}

@Injectable()
export class UserTrustCalculator {
  calculate(input: UserTrustInput, now = new Date()): UserTrustResult {
    const diversityScore = this.calculateDiversityScore(input.totalRatings, input.entityRatingCounts);
    const coverageScore = this.calculateCoverageScore(input);
    const stabilityScore = this.calculateStabilityScore(input.totalRatings, input.dailyRatingCounts);
    const consensusScore = this.calculateConsensusScore(input.totalRatings, input.scoreCounts);
    const accountAgeBonus = this.calculateAccountAgeBonus(input.accountCreatedAt, now);
    const accountAgeCap = this.calculateAccountAgeCap(input.accountCreatedAt, now);
    const anomalyPenalty = this.calculateAnomalyPenalty(input);
    const rawTrustScore =
      0.3 * diversityScore +
      0.25 * coverageScore +
      0.3 * stabilityScore +
      0.1 * consensusScore +
      accountAgeBonus -
      anomalyPenalty;
    const trustScore = roundToThreeDecimals(
      clamp(Math.min(rawTrustScore, accountAgeCap), 0.05, 1)
    );

    return {
      accountAgeBonus: roundToThreeDecimals(accountAgeBonus),
      anomalyPenalty: roundToThreeDecimals(anomalyPenalty),
      consensusScore: roundToThreeDecimals(consensusScore),
      coverageScore: roundToThreeDecimals(coverageScore),
      diversityScore: roundToThreeDecimals(diversityScore),
      stabilityScore: roundToThreeDecimals(stabilityScore),
      trustScore
    };
  }

  private calculateDiversityScore(totalRatings: number, entityRatingCounts: number[]): number {
    if (totalRatings < 3) {
      return 0.5;
    }

    if (entityRatingCounts.length === 0) {
      return 0.5;
    }

    const hhi = calculateHerfindahlIndex(entityRatingCounts);

    return clamp(0, 1, 1 - hhi);
  }

  private calculateCoverageScore(input: UserTrustInput): number {
    const typeScore = Math.min(1, input.uniqueEntityTypeCount / 5);
    const contextScore = Math.min(1, input.uniqueTypeParentPairCount / 8);
    const domainScore = Math.min(1, input.uniqueRootDomainCount / 5);

    return clamp(0, 1, 0.5 * typeScore + 0.35 * contextScore + 0.15 * domainScore);
  }

  private calculateStabilityScore(totalRatings: number, dailyRatingCounts: number[]): number {
    if (totalRatings < 5) {
      return 0.5;
    }

    const activeDays = dailyRatingCounts.filter((count) => count > 0).length;
    const maxDailyBurst = dailyRatingCounts.length > 0 ? Math.max(...dailyRatingCounts) : 0;
    const burstPenalty = Math.min(1, maxDailyBurst / 50);
    const spreadScore = Math.min(1, activeDays / 30);

    return clamp(0, 1, spreadScore * (1 - 0.7 * burstPenalty));
  }

  private calculateConsensusScore(
    totalRatings: number,
    scoreCounts: [number, number, number, number, number]
  ): number {
    if (totalRatings < 10) {
      return 0.5;
    }

    const dominantScore = Math.max(...scoreCounts) / totalRatings;
    const extremeOnly = (scoreCounts[0] + scoreCounts[4]) / totalRatings;

    if (dominantScore > 0.95) {
      return 0.3;
    }

    if (extremeOnly > 0.9) {
      return 0.4;
    }

    return clamp(0, 1, 0.5 + 0.5 * (1 - Math.abs(extremeOnly - 0.5)));
  }

  private calculateAccountAgeBonus(accountCreatedAt: Date, now: Date): number {
    const daysSinceRegistration = Math.max(
      0,
      (now.getTime() - accountCreatedAt.getTime()) / 86_400_000
    );

    return Math.min(0.05, (daysSinceRegistration / 365) * 0.05);
  }

  private calculateAccountAgeCap(accountCreatedAt: Date, now: Date): number {
    const daysSinceRegistration = Math.max(
      0,
      (now.getTime() - accountCreatedAt.getTime()) / 86_400_000
    );

    if (daysSinceRegistration < 1) {
      return 0.55;
    }

    if (daysSinceRegistration < 3) {
      return interpolate(0.55, 0.75, (daysSinceRegistration - 1) / 2);
    }

    if (daysSinceRegistration < 7) {
      return interpolate(0.75, 1, (daysSinceRegistration - 3) / 4);
    }

    return 1;
  }

  private calculateAnomalyPenalty(input: UserTrustInput): number {
    const hourlyRatingCounts = input.hourlyRatingCounts ?? [];
    const hourlyRatingUpdateCounts = input.hourlyRatingUpdateCounts ?? [];
    const maxHourlyCreates =
      hourlyRatingCounts.length > 0 ? Math.max(...hourlyRatingCounts) : 0;
    const maxHourlyUpdates =
      hourlyRatingUpdateCounts.length > 0 ? Math.max(...hourlyRatingUpdateCounts) : 0;
    const velocityPenalty = calculateLinearPenalty(maxHourlyCreates, {
      cap: 0.2,
      maxAt: 35,
      startsAt: 10
    });
    const hourlyEditPenalty = calculateLinearPenalty(maxHourlyUpdates, {
      cap: 0.1,
      maxAt: 15,
      startsAt: 3
    });
    const editRatioPenalty = calculateLinearPenalty(input.ratingEditRatio ?? 0, {
      cap: 0.05,
      maxAt: 1.5,
      startsAt: 0.5
    });
    const reviewModerationPenalty = this.calculateReviewModerationPenalty(input.reviewModeration);

    return clamp(
      input.anomalyPenalty +
        velocityPenalty +
        hourlyEditPenalty +
        editRatioPenalty +
        reviewModerationPenalty,
      0,
      0.3
    );
  }

  private calculateReviewModerationPenalty(
    reviewModeration: UserTrustInput["reviewModeration"]
  ): number {
    if (
      !reviewModeration ||
      reviewModeration.reviewsCount < 5 ||
      reviewModeration.hiddenReviewsCount < 2
    ) {
      return 0;
    }

    const hiddenRatio = reviewModeration.hiddenReviewsCount / reviewModeration.reviewsCount;

    return calculateLinearPenalty(hiddenRatio, {
      cap: 0.15,
      maxAt: 0.6,
      startsAt: 0.2
    });
  }
}

function calculateLinearPenalty(
  value: number,
  thresholds: { cap: number; maxAt: number; startsAt: number }
): number {
  if (value <= thresholds.startsAt) {
    return 0;
  }

  const denominator = thresholds.maxAt - thresholds.startsAt;

  if (denominator <= 0) {
    return thresholds.cap;
  }

  return thresholds.cap * clamp((value - thresholds.startsAt) / denominator, 0, 1);
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * clamp(progress, 0, 1);
}
