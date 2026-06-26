export class SearchEntityResultDto {
  canonicalUrl!: string | null;
  description!: string | null;
  id!: string;
  slug!: string;
  title!: string;
  type!: string;
}

export class SearchEntitiesResponseDto {
  canCreateEntity!: boolean;
  query!: string;
  results!: SearchEntityResultDto[];
}
