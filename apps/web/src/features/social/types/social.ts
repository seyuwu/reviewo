export type FriendshipStatus = "none" | "outgoing" | "incoming" | "friends" | "self" | null;

export type GamePartyKind = "TEAM" | "PARTY";

export type DotaPositionRole = "1" | "2" | "3" | "4" | "5";

export interface FriendUser {
  displayName: string;
  dotaSlug: string | null;
  friendshipId: string | null;
  id: string;
}

export interface FriendshipRequest {
  createdAt: string;
  direction: "incoming" | "outgoing";
  id: string;
  otherUser: FriendUser;
}

export interface FriendsListResponse {
  friends: FriendUser[];
}

export interface FriendshipRequestsResponse {
  incoming: FriendshipRequest[];
  outgoing: FriendshipRequest[];
}

export interface GamePartyMember {
  displayName: string;
  dotaAccountId?: string | null;
  dotaSlug: string | null;
  mmr: string | null;
  positionRole: DotaPositionRole | null;
  role: "OWNER" | "OFFICER" | "MEMBER";
  userId: string;
}

export interface GamePartyInviteFlag {
  count: number;
  key: string;
}

export interface GamePartyInvite {
  createdAt: string;
  direction?: "incoming" | "outgoing";
  expiresAt: string | null;
  greenFlags?: GamePartyInviteFlag[];
  id: string;
  inviteeDisplayName: string;
  inviteeDotaSlug?: string | null;
  inviteeMmr?: string | null;
  inviteeUserId: string;
  inviteKind?: "INVITE" | "APPLICATION";
  kind: GamePartyKind;
  partyName: string;
  partySlug: string;
  positionRole?: DotaPositionRole | null;
  redFlags?: GamePartyInviteFlag[];
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
}

export interface GameParty {
  canManageParty?: boolean;
  expiresAt: string | null;
  id: string;
  isMember: boolean;
  isOfficer?: boolean;
  isOwner: boolean;
  kind: GamePartyKind;
  maxMembers: number;
  memberCount: number;
  members: GamePartyMember[];
  name: string;
  openSlots: number;
  ownerUserId: string;
  slug: string;
  vertical: string;
  visibility: "PUBLIC" | "PRIVATE";
}

export interface MyPartiesResponse {
  invites: GamePartyInvite[];
  outgoingInvites: GamePartyInvite[];
  /** All active temporary parties (newest first). */
  parties: GameParty[];
  /** Most recently joined temporary party. */
  party: GameParty | null;
  team: GameParty | null;
}

export interface GamePartyChatMessage {
  createdAt: string;
  displayName: string;
  id: string;
  message: string;
  userId: string;
}

export interface GamePartyChatMessagesPage {
  messages: GamePartyChatMessage[];
  nextCursor: string | null;
}
