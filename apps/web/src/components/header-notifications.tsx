"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { playNotificationSound } from "../features/games/lib/play-notification-sound";
import { resolveInviteDecisionError } from "../features/games/lib/resolve-stack-invite-error";
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

/** Background badge refresh while the tab is visible. */
const POLL_IDLE_MS = 12_000;
/** Faster refresh while the panel is open. */
const POLL_OPEN_MS = 5_000;
/** Soft cap when the tab is hidden — skip most polls. */
const POLL_HIDDEN_MS = 60_000;

export function HeaderNotifications() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [incomingFriends, setIncomingFriends] = useState<FriendshipRequest[]>([]);
  const [partyInvites, setPartyInvites] = useState<GamePartyInvite[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(false);
  const inFlightRef = useRef(false);
  const pendingForceRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const accessTokenRef = useRef<string | null>(null);
  const knownPartyInviteIdsRef = useRef<Set<string> | null>(null);
  const knownFriendIdsRef = useRef<Set<string> | null>(null);

  accessTokenRef.current = authSession?.accessToken ?? null;

  const loadNotifications = useCallback(async (options?: { force?: boolean }) => {
    const accessToken = accessTokenRef.current;

    if (!accessToken) {
      return;
    }

    if (inFlightRef.current) {
      if (options?.force) {
        pendingForceRef.current = true;
      }

      return;
    }

    const now = Date.now();
    const minGapMs = openRef.current ? 1_500 : 4_000;

    if (!options?.force && now - lastFetchAtRef.current < minGapMs) {
      return;
    }

    inFlightRef.current = true;
    lastFetchAtRef.current = now;

    try {
      const [friends, parties] = await Promise.all([
        fetchFriendRequests(accessToken),
        fetchMyParties(accessToken)
      ]);

      if (accessTokenRef.current === accessToken) {
        setIncomingFriends(friends.incoming);
        // Incoming INVITEs + applicant's own APPLICATIONS (invitee).
        // Captain-side APPLICATIONS arrive as outgoing (inviter = captain).
        const incomingParty = parties.invites.filter(
          (invite) => invite.status === "PENDING"
        );
        const captainApplications = (parties.outgoingInvites ?? []).filter(
          (invite) => invite.inviteKind === "APPLICATION" && invite.status === "PENDING"
        );
        const byId = new Map<string, GamePartyInvite>();

        for (const invite of [...incomingParty, ...captainApplications]) {
          byId.set(invite.id, invite);
        }

        const nextPartyInvites = [...byId.values()];
        const nextPartyIds = new Set(nextPartyInvites.map((invite) => invite.id));
        const nextFriendIds = new Set(friends.incoming.map((request) => request.id));

        const knownParties = knownPartyInviteIdsRef.current;
        const knownFriends = knownFriendIdsRef.current;

        if (knownParties) {
          const notifyCandidates = nextPartyInvites.filter((invite) => {
            if (invite.inviteKind === "APPLICATION") {
              // Captain: new applications into your roster.
              return invite.direction === "outgoing";
            }

            // You: someone invited you into a party/team.
            return true;
          });
          const hasNewParty = notifyCandidates.some((invite) => !knownParties.has(invite.id));

          if (hasNewParty) {
            playNotificationSound();
          }
        }

        knownPartyInviteIdsRef.current = nextPartyIds;
        knownFriendIdsRef.current = nextFriendIds;
        setPartyInvites(nextPartyInvites);
      }
    } catch {
      // Keep previous values on transient failures.
    } finally {
      inFlightRef.current = false;

      if (pendingForceRef.current) {
        pendingForceRef.current = false;
        void loadNotifications({ force: true });
      }
    }
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      setIncomingFriends([]);
      setPartyInvites([]);
      setActionError(null);
      knownPartyInviteIdsRef.current = null;
      knownFriendIdsRef.current = null;
      return;
    }

    void loadNotifications({ force: true });

    const intervalId = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        const idleHidden = Date.now() - lastFetchAtRef.current >= POLL_HIDDEN_MS;

        if (!idleHidden) {
          return;
        }
      }

      void loadNotifications();
    }, open ? POLL_OPEN_MS : POLL_IDLE_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void loadNotifications({ force: true });
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authSession?.accessToken, loadNotifications, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadNotifications({ force: true });

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
  }, [loadNotifications, open]);

  if (!isAuthSessionLoaded || !authSession?.accessToken) {
    return null;
  }

  const totalCount = incomingFriends.length + partyInvites.length;

  function canAcceptPartyInvite(invite: GamePartyInvite): boolean {
    // Only captain can accept APPLICATIONS; applicants withdraw via decline.
    if (invite.inviteKind === "APPLICATION") {
      return invite.direction === "outgoing";
    }

    return true;
  }

  function partyInviteLabel(invite: GamePartyInvite): string {
    if (invite.inviteKind === "APPLICATION") {
      if (invite.direction !== "outgoing") {
        return t("web.nav.notificationsMyApplication");
      }

      return invite.kind === "PARTY"
        ? t("web.nav.notificationsPartyApplication")
        : t("web.nav.notificationsTeamApplication");
    }

    return invite.kind === "PARTY"
      ? t("web.nav.notificationsPartyInvite")
      : t("web.nav.notificationsTeamInvite");
  }

  async function handleAcceptFriend(request: FriendshipRequest) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(request.id);
    setActionError(null);

    try {
      await acceptFriendRequest(request.id, authSession.accessToken);
      setIncomingFriends((current) => current.filter((item) => item.id !== request.id));
    } catch {
      setActionError(t("web.nav.notificationsActionError"));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDeclineFriend(request: FriendshipRequest) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(request.id);
    setActionError(null);

    try {
      await declineFriendRequest(request.id, authSession.accessToken);
      setIncomingFriends((current) => current.filter((item) => item.id !== request.id));
    } catch {
      setActionError(t("web.nav.notificationsActionError"));
    } finally {
      setPendingId(null);
    }
  }

  async function handleAcceptParty(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(invite.id);
    setActionError(null);

    try {
      const party = await acceptPartyInvite(invite.id, authSession.accessToken);
      setPartyInvites((current) => current.filter((item) => item.id !== invite.id));
      setOpen(false);
      router.push(`/dota/teams/${party.slug}`);
    } catch (error) {
      setActionError(resolveInviteDecisionError(error, t));
      void loadNotifications({ force: true });
    } finally {
      setPendingId(null);
    }
  }

  async function handleDeclineParty(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setPendingId(invite.id);
    setActionError(null);

    try {
      await declinePartyInvite(invite.id, authSession.accessToken);
      setPartyInvites((current) => current.filter((item) => item.id !== invite.id));
    } catch (error) {
      setActionError(resolveInviteDecisionError(error, t));
      void loadNotifications({ force: true });
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

          {actionError ? <p className={styles.error}>{actionError}</p> : null}

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
                        className={`button-primary ${styles.acceptButton}`}
                        disabled={pendingId === request.id}
                        onClick={() => void handleAcceptFriend(request)}
                        type="button"
                      >
                        {t("dota.friends.accept")}
                      </button>
                      <button
                        className={`button-secondary ${styles.declineButton}`}
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
                {partyInvites.map((invite) => {
                  const isCaptainApplication =
                    invite.inviteKind === "APPLICATION" && invite.direction === "outgoing";
                  const showAccept = canAcceptPartyInvite(invite);
                  const title =
                    isCaptainApplication
                      ? invite.inviteeDisplayName || invite.partyName
                      : invite.partyName;

                  return (
                  <li key={invite.id}>
                    <div className={styles.itemCopy}>
                      <Link href={`/dota/teams/${invite.partySlug}`} onClick={() => setOpen(false)}>
                        {title}
                      </Link>
                      <span>{partyInviteLabel(invite)}</span>
                    </div>
                    <div className={styles.itemActions}>
                      {showAccept ? (
                        <button
                          className={`button-primary ${styles.acceptButton}`}
                          disabled={pendingId === invite.id}
                          onClick={() => void handleAcceptParty(invite)}
                          type="button"
                        >
                          {invite.inviteKind === "APPLICATION"
                            ? t("dota.friends.accept")
                            : t("dota.team.acceptInvite")}
                        </button>
                      ) : null}
                      <button
                        className={`button-secondary ${styles.declineButton}`}
                        disabled={pendingId === invite.id}
                        onClick={() => void handleDeclineParty(invite)}
                        type="button"
                      >
                        {invite.inviteKind === "APPLICATION" && !showAccept
                          ? t("games.search.withdrawApplication")
                          : t("dota.team.declineInvite")}
                      </button>
                    </div>
                  </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
