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

export interface PartyRecruitUpdatedPayload {
  looking: boolean;
  partyId?: string;
  partySlug: string;
  recruitedRoles: string[];
}

export interface PartyRealtimePublisher {
  broadcastPartyRecruitUpdated(payload: PartyRecruitUpdatedPayload): void;
  emitPartyNotification(userId: string, payload: PartyNotificationPayload): void;
}
