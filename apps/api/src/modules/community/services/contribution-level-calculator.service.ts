import type { ContributionLevel } from "#prisma/client";

import {
  CONTRIBUTION_INACTIVITY_DECAY_DAYS,
  CONTRIBUTION_LEVEL_ORDER,
  CONTRIBUTION_LEVEL_THRESHOLDS
} from "../constants/contribution-level.js";

export interface ContributionCountInput {
  battleVotesCount: number;
  discussionsCount: number;
  entitiesCreatedCount: number;
  fieldFixesCount: number;
  lastActivityAt: Date | null;
  ratingsCount: number;
  reviewsCount: number;
  topsCount: number;
}

export class ContributionLevelCalculator {
  calculate(input: ContributionCountInput, now = new Date()): ContributionLevel {
    const rawLevel = this.calculateRawLevel(input);
    return this.applyInactivityDecay(rawLevel, input.lastActivityAt, now);
  }

  private calculateRawLevel(input: ContributionCountInput): ContributionLevel {
    const { pioneer, curator, activeContributor, contributor } = CONTRIBUTION_LEVEL_THRESHOLDS;

    if (
      input.entitiesCreatedCount >= pioneer.minEntitiesCreated ||
      input.fieldFixesCount >= pioneer.minFieldFixes
    ) {
      return "pioneer";
    }

    if (
      input.topsCount >= curator.minTops ||
      (input.topsCount >= curator.minTopsWithFieldFixes &&
        input.fieldFixesCount >= curator.minFieldFixesWithTop)
    ) {
      return "curator";
    }

    if (
      input.ratingsCount >= activeContributor.minRatings ||
      input.reviewsCount >= activeContributor.minReviews ||
      input.topsCount >= activeContributor.minTops
    ) {
      return "active_contributor";
    }

    if (
      input.ratingsCount >= contributor.minRatings ||
      input.reviewsCount >= contributor.minReviews
    ) {
      return "contributor";
    }

    return "newcomer";
  }

  private applyInactivityDecay(
    level: ContributionLevel,
    lastActivityAt: Date | null,
    now: Date
  ): ContributionLevel {
    if (!lastActivityAt || level === "newcomer") {
      return level;
    }

    const inactiveMs = now.getTime() - lastActivityAt.getTime();
    const inactiveDays = inactiveMs / 86_400_000;

    if (inactiveDays < CONTRIBUTION_INACTIVITY_DECAY_DAYS) {
      return level;
    }

    const currentIndex = CONTRIBUTION_LEVEL_ORDER.indexOf(level);

    if (currentIndex <= 0) {
      return "newcomer";
    }

    return CONTRIBUTION_LEVEL_ORDER[currentIndex - 1] ?? "newcomer";
  }
}
