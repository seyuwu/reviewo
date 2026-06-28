import { Injectable } from "@nestjs/common";

import { calculateHerfindahlIndex, clamp, roundToThreeDecimals } from "../utils/reputation-math.js";

export interface UserTrustInput {
  accountCreatedAt: Date;
  anomalyPenalty: number;
  dailyRatingCounts: number[];
  entityRatingCounts: number[];
  scoreCounts: [number, number, number, number, number];
  totalRatings: number;
  uniqueEntityTypeCount: number;
  uniqueRootDomainCount: number;
  uniqueTypeParentPairCount: number;
}

export interface UserTrustResult {
  accountAgeBonus: number;
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
    const trustScore = roundToThreeDecimals(
      clamp(
        0.3 * diversityScore +
          0.25 * coverageScore +
          0.3 * stabilityScore +
          0.1 * consensusScore +
          accountAgeBonus -
          input.anomalyPenalty,
        0.05,
        1
      )
    );

    return {
      accountAgeBonus: roundToThreeDecimals(accountAgeBonus),
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
}
