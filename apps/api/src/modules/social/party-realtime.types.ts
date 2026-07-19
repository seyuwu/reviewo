import type { GamePartyResponseDto } from "./dto/game-party-response.dto.js";

export const PARTY_REALTIME_PUBLISHER = Symbol("PARTY_REALTIME_PUBLISHER");

export type PartyNotificationType =
  | "invite_received"
  | "application_received"
  | "accepted"
  | "declined"
  | "member_joined";

export interface PartyNotificationPayload {
  invite: {
    createdAt: string;
    direction?: "incoming" | "outgoing";
    expiresAt: string | null;
    id: string;
    inviteeDisplayName: string;
    inviteeDotaSlug?: string | null;
    inviteeMmr?: string | null;
    inviteeUserId: string;
    inviteKind?: "INVITE" | "APPLICATION";
    kind: "TEAM" | "PARTY";
    partyName: string;
    partySlug: string;
    positionRole?: "1" | "2" | "3" | "4" | "5" | null;
    status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
  };
  type: PartyNotificationType;
}

export type FriendNotificationType = "friend_request" | "friend_accepted";

export interface FriendNotificationPayload {
  request: {
    createdAt: string;
    direction: "incoming" | "outgoing";
    id: string;
    otherUser: {
      displayName: string;
      dotaSlug: string | null;
      id: string;
    };
  };
  type: FriendNotificationType;
}

export interface PartyRecruitUpdatedPayload {
  looking: boolean;
  partyId?: string;
  partySlug: string;
  recruitedRoles: string[];
}

export interface PartyRealtimePublisher {
  broadcastPartyRecruitUpdated(payload: PartyRecruitUpdatedPayload): void;
  broadcastPartyUpdated(party: GamePartyResponseDto): void;
  emitFriendNotification(userId: string, payload: FriendNotificationPayload): void;
  emitPartyNotification(userId: string, payload: PartyNotificationPayload): void;
}
