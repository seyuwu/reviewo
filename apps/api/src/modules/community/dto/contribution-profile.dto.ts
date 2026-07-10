import type { ContributionLevel } from "#prisma/client";

export class ContributionExpertiseDto {
  scopeKey!: string;
  scopeType!: "category" | "entity_type";
  score!: number;
}

export class ContributionCuratorRankDto {
  categoryId!: string;
  categorySlug?: string;
  categoryTitle?: string;
  score!: number;
}

export class ContributionProfileDto {
  badges!: string[];
  battleVotesCount!: number;
  curatorRanks!: ContributionCuratorRankDto[];
  discussionsCount!: number;
  entitiesCreatedCount!: number;
  expertise!: ContributionExpertiseDto[];
  fieldFixesCount!: number;
  level!: ContributionLevel;
  ratingsCount!: number;
  reviewsCount!: number;
  topsCount!: number;
}
