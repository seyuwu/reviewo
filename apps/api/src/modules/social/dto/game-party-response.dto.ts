import type { GamePartyKind } from "@reviewo/shared";

export class GamePartyMemberDto {
  displayName!: string;
  dotaSlug!: string | null;
  mmr!: string | null;
  role!: "OWNER" | "MEMBER";
  userId!: string;
}

export class GamePartyInviteDto {
  createdAt!: string;
  expiresAt!: string | null;
  id!: string;
  inviteeDisplayName!: string;
  inviteeUserId!: string;
  kind!: GamePartyKind;
  partyName!: string;
  partySlug!: string;
  status!: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
}

export class GamePartyResponseDto {
  expiresAt!: string | null;
  id!: string;
  isMember!: boolean;
  isOwner!: boolean;
  kind!: GamePartyKind;
  maxMembers!: number;
  memberCount!: number;
  members!: GamePartyMemberDto[];
  name!: string;
  openSlots!: number;
  ownerUserId!: string;
  slug!: string;
  vertical!: string;
  visibility!: "PUBLIC" | "PRIVATE";
}

export class MyPartiesResponseDto {
  invites!: GamePartyInviteDto[];
  party!: GamePartyResponseDto | null;
  team!: GamePartyResponseDto | null;
}

export class GamePartyChatMessageDto {
  createdAt!: string;
  displayName!: string;
  id!: string;
  message!: string;
  userId!: string;
}

export class GamePartyChatMessagesPageDto {
  messages!: GamePartyChatMessageDto[];
  nextCursor!: string | null;
}
