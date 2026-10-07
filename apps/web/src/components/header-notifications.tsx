"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthSession } from "../features/auth/hooks/use-auth-session";
import { playNotificationSound } from "../features/games/lib/play-notification-sound";
import { useNotificationToasts } from "../features/games/lib/use-notification-toasts";
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
import {
  PARTY_NOTIFICATION_EVENT,
  type PartyNotificationEventDetail
} from "../features/social/lib/party-notifications-socket";
import { FRIEND_REQUEST_NOTIFICATION_EVENT, type FriendNotificationEventDetail } from "../features/social/lib/friend-notifications";
import type { FriendshipRequest, GamePartyInvite } from "../features/social/types/social";
import { OpiniaIcon } from "./opinia-icon";
import { fetchTournamentNotifications, readMatchMention, type TournamentDisputeNotification } from "../features/tournaments/api/tournament-notifications-api";
import styles from "./header-notifications.module.css";

/** Fallback badge refresh while the tab is visible (realtime via socket). */
const POLL_IDLE_MS = 20_000;
/** Slightly faster refresh while the panel is open. */
const POLL_OPEN_MS = 15_000;
/** Soft cap when the tab is hidden — skip most polls. */
const POLL_HIDDEN_MS = 30_000;

export function HeaderNotifications() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const { push: pushToast } = useNotificationToasts();
  const [open, setOpen] = useState(false);
  const [incomingFriends, setIncomingFriends] = useState<FriendshipRequest[]>([]);
  const [partyInvites, setPartyInvites] = useState<GamePartyInvite[]>([]);
  const [tournamentDisputes, setTournamentDisputes] = useState<TournamentDisputeNotification[]>([]);
  const [matchMentions, setMatchMentions] = useState<TournamentDisputeNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(false);
  const inFlightRef = useRef(false);
  const pendingForceRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const accessTokenRef = useRef<string | null>(null);
  const dismissStorageKey = authSession?.userId
    ? `opinia.notifications.dismissed.v1:${authSession.userId}`
    : null;
  const knownPartyInviteIdsRef = useRef<Set<string> | null>(null);
  const knownPartyInviteStatusRef = useRef<Map<string, GamePartyInvite["status"]> | null>(null);
  const toastedEventIdsRef = useRef<Set<string>>(new Set());
  const knownFriendIdsRef = useRef<Set<string> | null>(null);
  const knownDisputesRef = useRef<Set<string> | null>(null);
  const knownMentionsRef = useRef<Set<string> | null>(null);

  accessTokenRef.current = authSession?.accessToken ?? null;

  useEffect(() => {
    setDismissedIds(new Set());
    if (!dismissStorageKey) return;
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(dismissStorageKey) ?? "[]");
      if (Array.isArray(stored)) setDismissedIds(new Set(stored.filter((item): item is string => typeof item === "string")));
    } catch { /* Ignore unavailable or malformed local notification preferences. */ }
  }, [dismissStorageKey]);

  useEffect(() => {
    setTournamentDisputes([]);
    knownDisputesRef.current = null;
    setMatchMentions([]); knownMentionsRef.current = null;
  }, [authSession?.accessToken]);

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
    const minGapMs = 700;

    if (!options?.force && now - lastFetchAtRef.current < minGapMs) {
      return;
    }

    inFlightRef.current = true;
    lastFetchAtRef.current = now;

    try {
      const [friends, parties, disputes] = await Promise.all([
        fetchFriendRequests(accessToken),
        fetchMyParties(accessToken),
        fetchTournamentNotifications(accessToken).catch(() => null)
      ]);

      if (accessTokenRef.current === accessToken) {
        setIncomingFriends(friends.incoming);

        const incomingAll = parties.invites;
        const outgoingAll = parties.outgoingInvites ?? [];

        // Bell: only actionable PENDING items.
        const incomingPending = incomingAll.filter((invite) => invite.status === "PENDING");
        const captainApplications = outgoingAll.filter(
          (invite) => invite.inviteKind === "APPLICATION" && invite.status === "PENDING"
        );
        const byId = new Map<string, GamePartyInvite>();

        for (const invite of [...incomingPending, ...captainApplications]) {
          byId.set(invite.id, invite);
        }

        const nextPartyInvites = [...byId.values()];
        const nextPartyIds = new Set(nextPartyInvites.map((invite) => invite.id));
        const nextFriendIds = new Set(friends.incoming.map((request) => request.id));

        const trackedInvites = [...incomingAll, ...outgoingAll];
        const nextStatusMap = new Map(
          trackedInvites.map((invite) => [invite.id, invite.status] as const)
        );

        let playedSound = false;

        function notifyOnce() {
          if (!playedSound) {
            playNotificationSound();
            playedSound = true;
          }
        }

        function pushToastOnce(
          eventId: string,
          toast: Parameters<typeof pushToast>[0]
        ): void {
          if (toastedEventIdsRef.current.has(eventId)) {
            return;
          }

          toastedEventIdsRef.current.add(eventId);
          notifyOnce();
          pushToast({ ...toast, id: eventId });
        }

        const knownFriends = knownFriendIdsRef.current;

        if (disputes) {
          setTournamentDisputes(disputes.items);
          const mentions = disputes.mentions ?? [];
          setMatchMentions(mentions);
          if (knownMentionsRef.current) for (const notice of mentions) {
            if (!knownMentionsRef.current.has(notice.id)) pushToastOnce("match-mention-" + notice.id, {
              title: t("dota.tournaments.matchChat.mentioned"), body: notice.reason,
              ctaLabel: t("dota.tournaments.matchChat.open"), href: notice.href
            });
          }
          knownMentionsRef.current = new Set(mentions.map((notice) => notice.id));
          if (knownDisputesRef.current) {
            for (const notice of disputes.items) {
              if (!knownDisputesRef.current.has(notice.eventId)) pushToastOnce("tournament-dispute-" + notice.eventId, {
                title: t("dota.tournaments.disputeNotificationTitle"),
                body: notice.tournamentTitle + ": " + notice.teams,
                ctaLabel: t("dota.tournaments.disputeNotificationOpen"), href: notice.href
              });
            }
          }
          knownDisputesRef.current = new Set(disputes.items.map((notice) => notice.eventId));
        }

        if (knownFriends) {
          for (const request of friends.incoming) {
            if (!knownFriends.has(request.id)) {
              pushToastOnce(`friend-new-${request.id}`, {
                body: t("web.toast.friendRequestBody", {
                  name: request.otherUser.displayName
                }),
                ctaLabel: t("web.toast.openFriends"),
                href: "/games/community",
                title: t("web.toast.friendRequest")
              });
              window.dispatchEvent(new CustomEvent(FRIEND_REQUEST_NOTIFICATION_EVENT));
            }
          }
        }

        const knownParties = knownPartyInviteIdsRef.current;
        const knownStatuses = knownPartyInviteStatusRef.current;

        if (knownParties && knownStatuses) {
          for (const invite of incomingPending) {
            if (invite.inviteKind === "INVITE" && !knownParties.has(invite.id)) {
              pushToastOnce(`invite-new-${invite.id}`, {
                body: t("web.toast.inviteReceivedBody", {
                  name: invite.partyName
                }),
                ctaLabel: t("web.toast.openTeam"),
                href: `/dota/teams/${invite.partySlug}`,
                title: t("web.toast.inviteReceived")
              });
            }
          }

          for (const invite of captainApplications) {
            if (!knownParties.has(invite.id)) {
              pushToastOnce(`app-new-${invite.id}`, {
                body: t("web.toast.applicationReceivedBody", {
                  name: invite.inviteeDisplayName ?? "—",
                  party: invite.partyName
                }),
                ctaLabel: t("web.toast.openTeam"),
                href: `/dota/teams/${invite.partySlug}`,
                title: t("web.toast.applicationReceived")
              });
            }
          }

          for (const invite of trackedInvites) {
            const previous = knownStatuses.get(invite.id);

            if (!previous || previous === invite.status) {
              continue;
            }

            if (invite.status === "ACCEPTED") {
              // Only toast "accepted" when the captain accepted YOUR application.
              // Accepting an INVITE yourself must not notify you.
              if (
                invite.inviteKind === "APPLICATION" &&
                invite.direction === "incoming"
              ) {
                const teamHref = `/dota/teams/${invite.partySlug}`;
                pushToastOnce(`accepted-${invite.id}`, {
                  body: t("web.toast.acceptedBody", { party: invite.partyName }),
                  ctaLabel: t("web.toast.openTeam"),
                  href: teamHref,
                  title: t("web.toast.accepted")
                });
                router.push(teamHref);
                continue;
              }

              // Captain/inviter: someone accepted your INVITE and joined the roster.
              if (invite.inviteKind === "INVITE" && invite.direction === "outgoing") {
                pushToastOnce(`joined-${invite.id}`, {
                  body: t("web.toast.memberJoinedBody", {
                    name: invite.inviteeDisplayName,
                    party: invite.partyName
                  }),
                  ctaLabel: t("web.toast.openTeam"),
                  href: `/dota/teams/${invite.partySlug}`,
                  title: t("web.toast.memberJoined")
                });
              }
            }

            // CANCELLED = system close (slot taken, race, TTL) — list refresh only.
            // Only human DECLINED gets an "Отказали" toast.
            if (invite.status === "DECLINED") {
              // Notify the other party, not the person who clicked decline:
              // - INVITE declined → toast for captain (outgoing)
              // - APPLICATION declined by captain → toast for applicant (incoming)
              const shouldNotify =
                (invite.inviteKind === "INVITE" && invite.direction === "outgoing") ||
                (invite.inviteKind === "APPLICATION" && invite.direction === "incoming");

              if (!shouldNotify) {
                continue;
              }

              const eventId = `declined-${invite.id}`;

              // Declined applications: toast without sound.
              if (invite.inviteKind === "APPLICATION") {
                if (!toastedEventIdsRef.current.has(eventId)) {
                  toastedEventIdsRef.current.add(eventId);
                  pushToast({
                    body: t("web.toast.declinedBody", { party: invite.partyName }),
                    id: eventId,
                    title: t("web.toast.declined")
                  });
                }
                continue;
              }

              pushToastOnce(eventId, {
                body: t("web.toast.declinedBody", { party: invite.partyName }),
                title: t("web.toast.declined")
              });
            }
          }
        }

        knownPartyInviteIdsRef.current = nextPartyIds;
        knownPartyInviteStatusRef.current = nextStatusMap;
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
  }, [pushToast, router, t]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      setIncomingFriends([]);
      setPartyInvites([]);
      setTournamentDisputes([]);
      knownDisputesRef.current = null;
      setActionError(null);
      knownPartyInviteIdsRef.current = null;
      knownPartyInviteStatusRef.current = null;
      toastedEventIdsRef.current = new Set();
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

    function handlePartyNotification(event: Event) {
      const detail = (event as CustomEvent<PartyNotificationEventDetail>).detail;

      if (detail?.toastId) {
        toastedEventIdsRef.current.add(detail.toastId);
      }

      // Instant badge/list update from socket payload (fetch confirms in background).
      if (detail?.invite && detail.type === "invite_received" && detail.invite.status === "PENDING") {
        setPartyInvites((current) => {
          if (current.some((item) => item.id === detail.invite.id)) {
            return current;
          }

          return [{ ...detail.invite, direction: "incoming" }, ...current];
        });
        knownPartyInviteIdsRef.current?.add(detail.invite.id);
      }

      if (
        detail?.invite &&
        detail.type === "application_received" &&
        detail.invite.status === "PENDING"
      ) {
        setPartyInvites((current) => {
          if (current.some((item) => item.id === detail.invite.id)) {
            return current;
          }

          return [
            {
              ...detail.invite,
              direction: "outgoing",
              inviteKind: detail.invite.inviteKind ?? "APPLICATION"
            },
            ...current
          ];
        });
        knownPartyInviteIdsRef.current?.add(detail.invite.id);
      }

      if (
        detail?.invite &&
        (detail.type === "declined" || detail.type === "accepted" || detail.type === "member_joined")
      ) {
        setPartyInvites((current) => current.filter((item) => item.id !== detail.invite.id));
        knownPartyInviteIdsRef.current?.delete(detail.invite.id);
      }

      void loadNotifications({ force: true });
    }

    function handleFriendNotification(event: Event) {
      const detail = (event as CustomEvent<FriendNotificationEventDetail>).detail;

      if (detail?.toastId) {
        toastedEventIdsRef.current.add(detail.toastId);
      }

      if (detail?.type === "friend_request" && detail.request) {
        setIncomingFriends((current) => {
          if (current.some((item) => item.id === detail.request.id)) {
            return current;
          }

          return [
            {
              createdAt: detail.request.createdAt,
              direction: "incoming",
              id: detail.request.id,
              otherUser: {
                displayName: detail.request.otherUser.displayName,
                dotaSlug: detail.request.otherUser.dotaSlug,
                friendshipId: detail.request.id,
                id: detail.request.otherUser.id
              }
            },
            ...current
          ];
        });
        knownFriendIdsRef.current?.add(detail.request.id);
      }

      void loadNotifications({ force: true });
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);
    window.addEventListener(FRIEND_REQUEST_NOTIFICATION_EVENT, handleFriendNotification);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(PARTY_NOTIFICATION_EVENT, handlePartyNotification);
      window.removeEventListener(FRIEND_REQUEST_NOTIFICATION_EVENT, handleFriendNotification);
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

  const visibleFriends = incomingFriends.filter((item) => !dismissedIds.has(`friend:${item.id}`));
  const visiblePartyInvites = partyInvites.filter((item) => !dismissedIds.has(`party:${item.id}`));
  const visibleDisputes = tournamentDisputes.filter((item) => !dismissedIds.has(`dispute:${item.eventId}`));
  const visibleMentions = matchMentions.filter((item) => !dismissedIds.has(`mention:${item.id}`));
  const totalCount = visibleFriends.length + visiblePartyInvites.length +
    visibleDisputes.length + visibleMentions.length;

  function dismissNotification(id: string) {
    const next = new Set(dismissedIds);
    next.add(id);
    setDismissedIds(next);
    if (!dismissStorageKey) return;
    try {
      window.localStorage.setItem(dismissStorageKey, JSON.stringify(Array.from(next).slice(-500)));
    } catch { /* Dismissal still applies for the current session if storage is unavailable. */ }
  }

  function dismissButton(id: string) {
    return <button
      aria-label={t("web.nav.dismissNotification")}
      className={styles.dismiss}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); dismissNotification(id); }}
      title={t("web.nav.dismissNotification")}
      type="button"
    >×</button>;
  }

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
      // Invitee joins the roster; captain accepting an application stays put.
      if (invite.inviteKind !== "APPLICATION") {
        router.push(`/dota/teams/${party.slug}`);
      }
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

          {visibleDisputes.length > 0 ? (
            <section className={styles.section}>
              <h3>{t("dota.tournaments.disputeNotificationTitle")}</h3>
              <ul className={styles.list}>
                {visibleDisputes.map((notice) => <li key={notice.eventId}>
                  {dismissButton(`dispute:${notice.eventId}`)}
                  <div className={styles.itemCopy}>
                    <strong>{notice.tournamentTitle}</strong>
                    <span>{notice.teams}</span>
                    <span>{notice.reason}</span>
                    <Link href={notice.href} onClick={() => setOpen(false)}>{t("dota.tournaments.disputeNotificationOpen")}</Link>
                  </div>
                </li>)}
              </ul>
            </section>
          ) : null}

          {visibleMentions.length > 0 ? <section className={styles.section}>
            <h3>{t("dota.tournaments.matchChat.mentioned")}</h3>
            <ul className={styles.list}>{visibleMentions.map((notice) => <li key={notice.id}>
              {dismissButton(`mention:${notice.id}`)}
              <div className={styles.itemCopy}><strong>{notice.tournamentTitle}</strong><span>{notice.teams}</span><span>{notice.reason}</span>
                <Link href={notice.href} onClick={() => {
                  setOpen(false);
                  const token = authSession?.accessToken;
                  if (token) void readMatchMention(notice.id, token).then(() => {
                    if (accessTokenRef.current === token) void loadNotifications({ force: true });
                  }).catch(() => undefined);
                }}>{t("dota.tournaments.matchChat.open")}</Link>
              </div>
            </li>)}</ul>
          </section> : null}

          {visibleFriends.length > 0 ? (
            <section className={styles.section}>
              <h3>{t("web.nav.notificationsFriends")}</h3>
              <ul className={styles.list}>
                {visibleFriends.map((request) => (
                  <li key={request.id}>
                    {dismissButton(`friend:${request.id}`)}
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

          {visiblePartyInvites.length > 0 ? (
            <section className={styles.section}>
              <h3>{t("web.nav.notificationsParties")}</h3>
              <ul className={styles.list}>
                {visiblePartyInvites.map((invite) => {
                  const isCaptainApplication =
                    invite.inviteKind === "APPLICATION" && invite.direction === "outgoing";
                  const showAccept = canAcceptPartyInvite(invite);
                  const title =
                    isCaptainApplication
                      ? invite.inviteeDisplayName || invite.partyName
                      : invite.partyName;

                  return (
                  <li key={invite.id}>
                    {dismissButton(`party:${invite.id}`)}
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
