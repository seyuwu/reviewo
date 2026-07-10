import type { ContributionLevel } from "#prisma/client";

export const CONTRIBUTION_BADGE_KEYS = [
  "first_steps",
  "rater",
  "reviewer",
  "battle_voter",
  "top_maker",
  "entity_scout",
  "catalog_editor",
  "discussion_starter",
  "recognized_curator",
  "pioneer"
] as const;

export type ContributionBadgeKey = (typeof CONTRIBUTION_BADGE_KEYS)[number];

export interface ContributionBadgeInput {
  battleVotesCount: number;
  discussionsCount: number;
  entitiesCreatedCount: number;
  fieldFixesCount: number;
  forksReceivedCount: number;
  level: ContributionLevel;
  likesReceivedCount: number;
  ratingsCount: number;
  reviewsCount: number;
  topsCount: number;
}

export function calculateContributionBadges(input: ContributionBadgeInput): ContributionBadgeKey[] {
  const badges: ContributionBadgeKey[] = [];
  const hasActivity =
    input.ratingsCount > 0 ||
    input.reviewsCount > 0 ||
    input.battleVotesCount > 0 ||
    input.topsCount > 0 ||
    input.entitiesCreatedCount > 0 ||
    input.fieldFixesCount > 0 ||
    input.discussionsCount > 0;

  if (hasActivity) {
    badges.push("first_steps");
  }

  if (input.ratingsCount >= 10) {
    badges.push("rater");
  }

  if (input.reviewsCount >= 3) {
    badges.push("reviewer");
  }

  if (input.battleVotesCount >= 10) {
    badges.push("battle_voter");
  }

  if (input.topsCount >= 1) {
    badges.push("top_maker");
  }

  if (input.entitiesCreatedCount >= 1) {
    badges.push("entity_scout");
  }

  if (input.fieldFixesCount >= 5) {
    badges.push("catalog_editor");
  }

  if (input.discussionsCount >= 5) {
    badges.push("discussion_starter");
  }

  if (input.likesReceivedCount >= 3 || input.forksReceivedCount >= 1) {
    badges.push("recognized_curator");
  }

  if (input.level === "pioneer") {
    badges.push("pioneer");
  }

  return badges;
}
