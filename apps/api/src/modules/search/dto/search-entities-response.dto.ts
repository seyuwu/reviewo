export type SearchResultKind = "canonical_site" | "entity";

export class SearchEntityResultDto {
  avgScore!: number | null;
  canonicalUrl!: string | null;
  description!: string | null;
  id!: string;
  resultKind!: SearchResultKind;
  reviewsCount!: number;
  slug!: string;
  title!: string;
  type!: string;
  votesCount!: number;
}

export class SearchEntitiesResponseDto {
  canCreateEntity!: boolean;
  query!: string;
  results!: SearchEntityResultDto[];
}
