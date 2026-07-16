import { io, type Socket } from "socket.io-client";

import { publicEnv } from "../../../lib/config/public-env";
import type { GamePartyInvite } from "../types/social";

export type PartyNotificationType =
  | "invite_received"
  | "application_received"
  | "accepted"
  | "declined"
  | "member_joined";

export interface PartyNotificationPayload {
  invite: GamePartyInvite;
  type: PartyNotificationType;
}

export const PARTY_NOTIFICATION_EVENT = "opinia:party-notification";

export interface PartyNotificationEventDetail extends PartyNotificationPayload {
  toastId: string;
}

export function partyNotificationToastId(
  type: PartyNotificationType,
  inviteId: string
): string {
  switch (type) {
    case "invite_received":
      return `invite-new-${inviteId}`;
    case "application_received":
      return `app-new-${inviteId}`;
    case "accepted":
      return `accepted-${inviteId}`;
    case "member_joined":
      return `joined-${inviteId}`;
    case "declined":
      return `declined-${inviteId}`;
  }
}

export function dispatchPartyNotificationEvent(detail: PartyNotificationEventDetail): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(PARTY_NOTIFICATION_EVENT, { detail }));
}

export interface PartyNotificationsSocketConnection {
  disconnect: () => void;
}

export function connectPartyNotificationsSocket(
  accessToken: string,
  onEvent: (payload: PartyNotificationPayload) => void
): PartyNotificationsSocketConnection {
  const socket: Socket = io(`${publicEnv.apiBaseUrl}/parties`, {
    auth: { token: accessToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    transports: ["websocket", "polling"]
  });

  socket.on("party_notification", (payload: PartyNotificationPayload) => {
    if (!payload?.invite?.id || !payload.type) {
      return;
    }

    onEvent(payload);
  });

  return {
    disconnect: () => {
      socket.off();
      socket.disconnect();
    }
  };
}
