"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { useTranslation } from "../features/i18n/locale-provider";
import {
  acceptFriendRequest,
  acceptPartyInvite,
  declineFriendRequest,
  declinePartyInvite,
  fetchFriendRequests,
  fetchMyParties
} from "../features/social/api/social-api";
import type { FriendshipRequest, GamePartyInvite } from "../features/social/types/social";
import { OpiniaIcon } from "./opinia-icon";
import styles from "./header-notifications.module.css";

const POLL_MS = 45_000;

export function HeaderNotifications() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [incomingFriends, setIncomingFriends] = useState<FriendshipRequest[]>([]);
  const [partyInvites, setPartyInvites] = useState<GamePartyInvite[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authSession?.accessToken) {
      setIncomingFriends([]);
      setPartyInvites([]);
      return;
    }

    let cancelled = false;

    async function loadNotifications() {
      if (!authSession?.accessToken) {
        return;
      }

      try {
        const [friends, parties] = await Promise.all([
          fetchFriendRequests(authSession.accessToken),
          fetchMyParties(authSession.accessToken)
        ]);

        if (!cancelled) {
          setIncomingFriends(friends.incoming);
          setPartyInvites(parties.invites);
        }
      } catch {
        // Keep previous values on transient failures.
      }
    }

    void loadNotifications();
    const intervalId = window.setInterval(() => {
      void loadNotifications();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authSession?.accessToken]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!isAuthSessionLoaded || !authSession?.accessToken) {
    return null;
  }

  const totalCount = incomingFriends.length + partyInvites.length;

  async function handleAcceptFriend(request: FriendshipRequest) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(request.id);

    try {
      await acceptFriendRequest(request.id, authSession.accessToken);
      setIncomingFriends((current) => current.filter((item) => item.id !== request.id));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDeclineFriend(request: FriendshipRequest) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(request.id);

    try {
      await declineFriendRequest(request.id, authSession.accessToken);
      setIncomingFriends((current) => current.filter((item) => item.id !== request.id));
    } finally {
      setPendingId(null);
    }
  }

  async function handleAcceptParty(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(invite.id);

    try {
      const party = await acceptPartyInvite(invite.id, authSession.accessToken);
      setPartyInvites((current) => current.filter((item) => item.id !== invite.id));
      setOpen(false);
      router.push(`/dota/teams/${party.slug}`);
    } finally {
      setPendingId(null);
    }
  }

  async function handleDeclineParty(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(invite.id);

    try {
      await declinePartyInvite(invite.id, authSession.accessToken);
      setPartyInvites((current) => current.filter((item) => item.id !== invite.id));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        title={t("web.nav.notificationsTitle")}
        type="button"
      >
        <span className={styles.triggerIcon} aria-hidden="true">
          <OpiniaIcon name="bell" />
        </span>
        {totalCount > 0 ? (
          <span className={styles.badge}>{totalCount > 9 ? "9+" : String(totalCount)}</span>
        ) : null}
        <span className="sr-only">
          {t("web.nav.notificationsAria", { count: String(totalCount) })}
        </span>
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label={t("web.nav.notificationsTitle")}>
          <p className={styles.panelTitle}>{t("web.nav.notificationsTitle")}</p>

          {totalCount === 0 ? (
            <p className={styles.empty}>{t("web.nav.notificationsEmpty")}</p>
          ) : null}

          {incomingFriends.length > 0 ? (
            <section className={styles.section}>
              <h3>{t("web.nav.notificationsFriends")}</h3>
              <ul className={styles.list}>
                {incomingFriends.map((request) => (
                  <li key={request.id}>
                    <div className={styles.itemCopy}>
                      {request.otherUser.dotaSlug ? (
                        <Link href={`/dota/${request.otherUser.dotaSlug}`} onClick={() => setOpen(false)}>
                          {request.otherUser.displayName}
                        </Link>
                      ) : (
                        <strong>{request.otherUser.displayName}</strong>
                      )}
                      <span>{t("web.nav.notificationsFriendRequest")}</span>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className="button-primary"
                        disabled={pendingId === request.id}
                        onClick={() => void handleAcceptFriend(request)}
                        type="button"
                      >
                        {t("dota.friends.accept")}
                      </button>
                      <button
                        className="button-secondary"
                        disabled={pendingId === request.id}
                        onClick={() => void handleDeclineFriend(request)}
                        type="button"
                      >
                        {t("dota.friends.decline")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {partyInvites.length > 0 ? (
            <section className={styles.section}>
              <h3>{t("web.nav.notificationsParties")}</h3>
              <ul className={styles.list}>
                {partyInvites.map((invite) => (
                  <li key={invite.id}>
                    <div className={styles.itemCopy}>
                      <Link href={`/dota/teams/${invite.partySlug}`} onClick={() => setOpen(false)}>
                        {invite.partyName}
                      </Link>
                      <span>
                        {invite.kind === "PARTY"
                          ? t("web.nav.notificationsPartyInvite")
                          : t("web.nav.notificationsTeamInvite")}
                      </span>
                    </div>
                    <div className={styles.itemActions}>
                      <button
                        className="button-primary"
                        disabled={pendingId === invite.id}
                        onClick={() => void handleAcceptParty(invite)}
                        type="button"
                      >
                        {t("dota.team.acceptInvite")}
                      </button>
                      <button
                        className="button-secondary"
                        disabled={pendingId === invite.id}
                        onClick={() => void handleDeclineParty(invite)}
                        type="button"
                      >
                        {t("dota.team.declineInvite")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
