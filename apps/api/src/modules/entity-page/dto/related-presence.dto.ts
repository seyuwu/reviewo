export class RelatedPresenceRatingDto {
  avgScore!: number;
  votesCount!: number;
}

export class RelatedPresenceDto {
  canonicalUrl!: string | null;
  id!: string;
  logoUrl!: string | null;
  rating!: RelatedPresenceRatingDto | null;
  slug!: string;
  title!: string;
  type!: string;
}

export class RelatedPresencesResponseDto {
  items!: RelatedPresenceDto[];
}
