import type { GamePartyJoinMode, GamePartyKind } from "@reviewo/shared";

export class GamePartyMemberDto {
  displayName!: string;
  dotaAccountId!: string | null;
  dotaSlug!: string | null;
  mmr!: string | null;
  positionRole!: "1" | "2" | "3" | "4" | "5" | null;
  role!: "OWNER" | "OFFICER" | "MEMBER";
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
  /** Captain or sub-captain: recruit, apps, invites, kick members. */
  canManageParty!: boolean;
  /** Captain/officer can add another extend window before max lifetime. */
  canExtendParty!: boolean;
  /** Captain/officer can extend temporary team Discord voice before max lifetime. */
  canExtendDiscordVoice!: boolean;
  /** Invite URL when a Discord voice was created for this party. */
  discordInviteUrl!: string | null;
  /** True when Discord voice integration is configured on the server. */
  discordVoiceAvailable!: boolean;
  /** When temporary Discord voice (esp. team) will be deleted. */
  discordVoiceExpiresAt!: string | null;
  expiresAt!: string | null;
  id!: string;
  isMember!: boolean;
  isOfficer!: boolean;
  isOwner!: boolean;
  /** OPEN = instant LFG join; CONFIRM = application required. */
  joinMode!: GamePartyJoinMode;
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

export class PartyDiscordVoiceResponseDto {
  channelId!: string;
  guildId!: string;
  inviteUrl!: string;
  /** When this Discord voice channel will be deleted (team voice TTL / party expiry). */
  expiresAt!: string | null;
  /** True when bot moved the user into the voice channel (already on this guild voice). */
  movedToVoice!: boolean;
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
