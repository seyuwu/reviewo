export const FRIEND_REQUEST_NOTIFICATION_EVENT = "opinia:friend-request-notification";
export const OPEN_FRIENDS_DOCK_EVENT = "opinia:open-friends-dock";

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

export interface FriendNotificationEventDetail extends FriendNotificationPayload {
  openDock?: boolean;
  toastId: string;
}

export function friendNotificationToastId(
  type: FriendNotificationType,
  requestId: string
): string {
  return type === "friend_request" ? `friend-new-${requestId}` : `friend-accepted-${requestId}`;
}

export function dispatchFriendNotificationEvent(detail: FriendNotificationEventDetail): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(FRIEND_REQUEST_NOTIFICATION_EVENT, { detail }));
}

export function dispatchOpenFriendsDock(tab: "friends" | "requests" = "requests"): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(OPEN_FRIENDS_DOCK_EVENT, { detail: { tab } })
  );
}
