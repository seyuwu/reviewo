export class DotaProfileProgressDto {
  current!: number;
  target!: number;
}

export class DotaProfileResponseDto {
  dotaAccountId!: string;
  entityId!: string;
  friendshipRequestId!: string | null;
  friendshipStatus!: "none" | "outgoing" | "incoming" | "friends" | "self" | null;
  gender!: string | null;
  hasMic!: boolean | null;
  isOwner!: boolean;
  language!: string | null;
  mmr!: string | null;
  ownerUserId!: string | null;
  playIntent!: string | null;
  progress!: DotaProfileProgressDto;
  qualities!: Record<string, number>;
  roles!: string[];
  server!: string | null;
  slug!: string;
  title!: string;
}
