import type { ContributionLevel } from "#prisma/client";

export const SPOTLIGHT_MONTHLY_GRANTS: Record<ContributionLevel, number> = {
  newcomer: 0,
  contributor: 10,
  active_contributor: 20,
  curator: 50,
  pioneer: 100
};

export const SPOTLIGHT_EXPIRY_RETENTION_RATE = 0.5;

export const SPOTLIGHT_MIN_TRUST_SCORE = 0.35;

export const SPOTLIGHT_SPEND_COSTS = {
  battle_boost: 15,
  entity_spotlight: 10,
  top_highlight: 20
} as const;

export const SPOTLIGHT_HOURS_PER_CREDIT = 2;

export const SPOTLIGHT_MAX_SPEND_PER_REQUEST = 200;

export const SPOTLIGHT_MAX_ACTIVE_PLACEMENTS_PER_USER = 5;

export const SPOTLIGHT_DURATIONS_MS = {
  battle_boost: 7 * 86_400_000,
  entity_spotlight: 24 * 3_600_000,
  top_highlight: 7 * 86_400_000
} as const;

export type SpotlightSpendType = keyof typeof SPOTLIGHT_SPEND_COSTS;
