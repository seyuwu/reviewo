export type FriendshipStatus = "none" | "outgoing" | "incoming" | "friends" | "self" | null;

export type GamePartyKind = "TEAM" | "PARTY";

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
  dotaSlug: string | null;
  mmr: string | null;
  role: "OWNER" | "MEMBER";
  userId: string;
}

export interface GamePartyInvite {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  inviteeDisplayName: string;
  inviteeUserId: string;
  kind: GamePartyKind;
  partyName: string;
  partySlug: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
}

export interface GameParty {
  expiresAt: string | null;
  id: string;
  isMember: boolean;
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
