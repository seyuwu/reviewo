import type { GamePartyKind } from "@reviewo/shared";

export class GamePartyMemberDto {
  displayName!: string;
  dotaAccountId!: string | null;
  dotaSlug!: string | null;
  mmr!: string | null;
  positionRole!: "1" | "2" | "3" | "4" | "5" | null;
  role!: "OWNER" | "MEMBER";
  userId!: string;
}

export class GamePartyInviteFlagDto {
  count!: number;
  key!: string;
}

export class GamePartyInviteDto {
  createdAt!: string;
  direction!: "incoming" | "outgoing";
  expiresAt!: string | null;
  id!: string;
  inviteeDisplayName!: string;
  inviteeDotaSlug!: string | null;
  inviteeMmr!: string | null;
  inviteeUserId!: string;
  kind!: GamePartyKind;
  inviteKind!: "INVITE" | "APPLICATION";
  partyName!: string;
  partySlug!: string;
  positionRole!: "1" | "2" | "3" | "4" | "5" | null;
  redFlags!: GamePartyInviteFlagDto[];
  greenFlags!: GamePartyInviteFlagDto[];
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
  /** Stack invites you sent (pending + briefly after accept/decline). */
  outgoingInvites!: GamePartyInviteDto[];
  /** All active temporary parties the user belongs to (newest first). */
  parties!: GamePartyResponseDto[];
  /** Most recently joined temporary party (compat shorthand). */
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
