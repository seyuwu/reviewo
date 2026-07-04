import type { EntityType } from "#prisma/client";

export type SearchResultKind = "canonical_site" | "entity";

export class RankedSearchEntityDto {
  avgScore!: number | null;
  canonicalUrl!: string | null;
  description!: string | null;
  id!: string;
  parentId!: string | null;
  resultKind!: SearchResultKind;
  reviewsCount!: number;
  slug!: string;
  title!: string;
  type!: EntityType;
  votesCount!: number;
}
