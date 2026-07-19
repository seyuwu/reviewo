"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { playNotificationSound } from "../../games/lib/play-notification-sound";
import { useNotificationToasts } from "../../games/lib/use-notification-toasts";
import { useTranslation } from "../../i18n/locale-provider";
import {
  dispatchFriendNotificationEvent,
  friendNotificationToastId,
  OPEN_FRIENDS_DOCK_EVENT,
  type FriendNotificationPayload
} from "../lib/friend-notifications";
import {
  connectPartyNotificationsSocket,
  dispatchPartyNotificationEvent,
  partyNotificationToastId,
  type PartyNotificationPayload,
  type PartyNotificationsSocketConnection
} from "../lib/party-notifications-socket";

/**
 * Long-lived `/parties` socket for the signed-in user: toast + sound +
 * `opinia:party-notification` for list refreshers (header, games search).
 */
export function usePartyNotifications(): void {
  const { authSession } = useAuthSession();
  const { push: pushToast } = useNotificationToasts();
  const router = useRouter();
  const t = useTranslation();
  const toastedIdsRef = useRef<Set<string>>(new Set());
  const accessToken = authSession?.accessToken ?? null;

  useEffect(() => {
    if (!accessToken) {
      toastedIdsRef.current = new Set();
      return;
    }

    let connection: PartyNotificationsSocketConnection | null = null;

    function handleFriendPayload(payload: FriendNotificationPayload): void {
      const toastId = friendNotificationToastId(payload.type, payload.request.id);

      dispatchFriendNotificationEvent({
        ...payload,
        openDock: payload.type === "friend_request",
        toastId
      });

      if (toastedIdsRef.current.has(toastId)) {
        return;
      }

      toastedIdsRef.current.add(toastId);
      playNotificationSound();

      if (payload.type === "friend_request") {
        pushToast({
          actionEvent: OPEN_FRIENDS_DOCK_EVENT,
          body: t("web.toast.friendRequestBody", {
            name: payload.request.otherUser.displayName
          }),
          ctaLabel: t("web.toast.openFriends"),
          id: toastId,
          title: t("web.toast.friendRequest")
        });
        return;
      }

      pushToast({
        actionEvent: OPEN_FRIENDS_DOCK_EVENT,
        body: t("web.toast.friendAcceptedBody", {
          name: payload.request.otherUser.displayName
        }),
        ctaLabel: t("web.toast.openFriends"),
        id: toastId,
        title: t("web.toast.friendAccepted")
      });
    }

    function handlePayload(payload: PartyNotificationPayload): void {
      const toastId = partyNotificationToastId(payload.type, payload.invite.id);
      const invite = payload.invite;

      dispatchPartyNotificationEvent({ ...payload, toastId });

      // Application declined/withdrawn: no notification sound.
      if (payload.type === "declined" && invite.inviteKind === "APPLICATION") {
        // Applicant withdrew — captain only needs the list update.
        if (invite.direction === "outgoing") {
          return;
        }

        if (toastedIdsRef.current.has(toastId)) {
          return;
        }

        toastedIdsRef.current.add(toastId);
        pushToast({
          body: t("web.toast.declinedBody", { party: invite.partyName }),
          id: toastId,
          title: t("web.toast.declined")
        });
        return;
      }

      if (toastedIdsRef.current.has(toastId)) {
        return;
      }

      toastedIdsRef.current.add(toastId);
      playNotificationSound();

      const teamHref = `/dota/teams/${invite.partySlug}`;

      switch (payload.type) {
        case "invite_received":
          pushToast({
            body: t("web.toast.inviteReceivedBody", { name: invite.partyName }),
            ctaLabel: t("web.toast.openTeam"),
            href: teamHref,
            id: toastId,
            title: t("web.toast.inviteReceived")
          });
          break;
        case "application_received":
          pushToast({
            body: t("web.toast.applicationReceivedBody", {
              name: invite.inviteeDisplayName ?? "—",
              party: invite.partyName
            }),
            ctaLabel: t("web.toast.openTeam"),
            href: teamHref,
            id: toastId,
            title: t("web.toast.applicationReceived")
          });
          break;
        case "accepted":
          pushToast({
            body: t("web.toast.acceptedBody", { party: invite.partyName }),
            ctaLabel: t("web.toast.openTeam"),
            href: teamHref,
            id: toastId,
            title: t("web.toast.accepted")
          });
          router.push(teamHref);
          break;
        case "member_joined":
          pushToast({
            body: t("web.toast.memberJoinedBody", {
              name: invite.inviteeDisplayName,
              party: invite.partyName
            }),
            ctaLabel: t("web.toast.openTeam"),
            href: teamHref,
            id: toastId,
            title: t("web.toast.memberJoined")
          });
          break;
        case "declined":
          pushToast({
            body: t("web.toast.declinedBody", { party: invite.partyName }),
            id: toastId,
            title: t("web.toast.declined")
          });
          break;
      }
    }

    connection = connectPartyNotificationsSocket(accessToken, handlePayload, handleFriendPayload);

    return () => {
      connection?.disconnect();
    };
  }, [accessToken, pushToast, router, t]);
}
