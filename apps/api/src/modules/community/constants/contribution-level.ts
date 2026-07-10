import type { ContributionLevel } from "#prisma/client";

export const CONTRIBUTION_LEVEL_ORDER: ContributionLevel[] = [
  "newcomer",
  "contributor",
  "active_contributor",
  "curator",
  "pioneer"
];

export const CONTRIBUTION_LEVEL_THRESHOLDS = {
  contributor: {
    minRatings: 10,
    minReviews: 3
  },
  activeContributor: {
    minRatings: 50,
    minReviews: 10,
    minTops: 1
  },
  curator: {
    minFieldFixesWithTop: 5,
    minTops: 3,
    minTopsWithFieldFixes: 1
  },
  pioneer: {
    minEntitiesCreated: 5,
    minFieldFixes: 20
  }
} as const;

export const CONTRIBUTION_INACTIVITY_DECAY_DAYS = 90;
