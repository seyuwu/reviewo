export class DotaLfgFlagDto {
  count!: number;
  key!: string;
}

export class DotaLfgHitDto {
  /** Position roles already taken on the recruiting party. */
  claimedRoles!: string[];
  desiredSize!: number | null;
  greenFlags!: DotaLfgFlagDto[];
  /** OPEN = instant join; CONFIRM = application. Solo looking defaults OPEN. */
  joinMode!: "OPEN" | "CONFIRM";
  memberCount!: number | null;
  /** Captain MMR for solo looking; average party MMR when recruiting. */
  mmr!: string | null;
  ownerUserId!: string;
  partyKind!: "TEAM" | "PARTY" | null;
  partyName!: string | null;
  partySlug!: string | null;
  recruitedRoles!: string[];
  redFlags!: DotaLfgFlagDto[];
  roles!: string[];
  server!: string | null;
  slug!: string;
  title!: string;
}

export class DotaLfgListResponseDto {
  results!: DotaLfgHitDto[];
}
