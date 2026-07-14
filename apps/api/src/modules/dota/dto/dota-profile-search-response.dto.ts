export class DotaProfileSearchHitDto {
  dotaAccountId!: string;
  entityId!: string;
  mmr!: string | null;
  slug!: string;
  title!: string;
  username!: string | null;
}

export class DotaProfileSearchResponseDto {
  query!: string;
  results!: DotaProfileSearchHitDto[];
}
