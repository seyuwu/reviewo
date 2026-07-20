"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useMyDotaProfileNav } from "../../dota/hooks/use-my-dota-profile-nav";
import { buildDotaFriendInviteUrl } from "../../dota/lib/share";
import { useTranslation } from "../../i18n/locale-provider";
import { isApiError, readApiErrorMessage } from "../../../lib/api/read-api-error";
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriendInviteToken,
  fetchFriendRequests,
  fetchFriends,
  fetchMyParties,
  inviteFriendToParty
} from "../api/social-api";
import type { FriendUser, FriendshipRequest, GameParty } from "../types/social";
import {
  FRIEND_REQUEST_NOTIFICATION_EVENT,
  OPEN_FRIENDS_DOCK_EVENT,
  type FriendNotificationEventDetail
} from "../lib/friend-notifications";
import styles from "./friends-dock.module.css";

const POLL_CLOSED_MS = 20_000;
const POLL_OPEN_MS = 12_000;

type DockTab = "friends" | "requests";

export function FriendsDock() {
  const t = useTranslation();
  const pathname = usePathname();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const profileNav = useMyDotaProfileNav();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DockTab>("friends");
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendshipRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendshipRequest[]>([]);
  const [inviteTarget, setInviteTarget] = useState<GameParty | null>(null);
  const [friendQuery, setFriendQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const accessTokenRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  accessTokenRef.current = authSession?.accessToken ?? null;

  const preferredPartySlug = useMemo(() => {
    const match = pathname?.match(/^\/dota\/teams\/([^/?#]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  const refresh = useCallback(async () => {
    const accessToken = accessTokenRef.current;

    if (!accessToken || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);

    try {
      const [friendsResponse, requestsResponse, partiesResponse] = await Promise.all([
        fetchFriends(accessToken),
        fetchFriendRequests(accessToken),
        fetchMyParties(accessToken).catch(() => null)
      ]);

      if (accessTokenRef.current === accessToken) {
        setFriends(friendsResponse.friends);
        setIncoming(requestsResponse.incoming);
        setOutgoing(requestsResponse.outgoing);
        setInviteTarget(resolveInviteTarget(partiesResponse, preferredPartySlug));
        setError(null);
      }
    } catch {
      if (accessTokenRef.current === accessToken) {
        setError(t("web.friendsDock.loadError"));
      }
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [preferredPartySlug, t]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      setFriends([]);
      setIncoming([]);
      setOutgoing([]);
      setInviteTarget(null);
      setInvitedIds(new Set());
      setFriendQuery("");
      setOpen(false);
      return;
    }

    void refresh();

    const intervalId = window.setInterval(
      () => {
        void refresh();
      },
      open ? POLL_OPEN_MS : POLL_CLOSED_MS
    );

    function handleFriendNotification(event: Event) {
      const detail = (event as CustomEvent<FriendNotificationEventDetail>).detail;
      void refresh();

      if (detail?.type === "friend_request") {
        setTab("requests");
        if (detail.openDock) {
          setOpen(true);
        }
      }

      if (detail?.type === "friend_accepted") {
        setTab("friends");
      }
    }

    function handleOpenDock(event: Event) {
      const detail = (event as CustomEvent<{ tab?: DockTab }>).detail;
      setOpen(true);
      setTab(detail?.tab === "friends" ? "friends" : "requests");
      void refresh();
    }

    window.addEventListener(FRIEND_REQUEST_NOTIFICATION_EVENT, handleFriendNotification);
    window.addEventListener(OPEN_FRIENDS_DOCK_EVENT, handleOpenDock);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener(FRIEND_REQUEST_NOTIFICATION_EVENT, handleFriendNotification);
      window.removeEventListener(OPEN_FRIENDS_DOCK_EVENT, handleOpenDock);
    };
  }, [authSession?.accessToken, open, refresh]);

  useEffect(() => {
    if (open && tab === "friends") {
      searchInputRef.current?.focus();
    }
  }, [open, tab]);

  const rosterMemberIds = useMemo(() => {
    if (!inviteTarget) {
      return new Set<string>();
    }

    return new Set(inviteTarget.members.map((member) => member.userId));
  }, [inviteTarget]);

  const filteredFriends = useMemo(() => {
    const query = friendQuery.trim().toLowerCase();

    if (!query) {
      return friends;
    }

    return friends.filter((friend) => friend.displayName.toLowerCase().includes(query));
  }, [friendQuery, friends]);

  if (!isAuthSessionLoaded || !authSession?.accessToken) {
    return null;
  }

  const session = authSession;
  const accountHref = profileNav.slug ? `/dota/${profileNav.slug}` : "/profile";
  const incomingCount = incoming.length;

  async function handleAccept(request: FriendshipRequest) {
    if (busyId) {
      return;
    }

    setBusyId(request.id);
    setError(null);

    try {
      await acceptFriendRequest(request.id, session.accessToken);
      await refresh();
      setTab("friends");
    } catch {
      setError(t("dota.friends.actionError"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(request: FriendshipRequest) {
    if (busyId) {
      return;
    }

    setBusyId(request.id);
    setError(null);

    try {
      await declineFriendRequest(request.id, session.accessToken);
      await refresh();
    } catch {
      setError(t("dota.friends.actionError"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopyFriendLink() {
    if (!profileNav.slug || busyId) {
      return;
    }

    setBusyId("invite-link");
    setError(null);

    try {
      const { token } = await fetchFriendInviteToken(session.accessToken);
      const url = buildDotaFriendInviteUrl(profileNav.slug, token);
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setError(t("dota.friends.actionError"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleInviteFriend(friend: FriendUser) {
    if (busyId) {
      return;
    }

    if (!inviteTarget || inviteTarget.openSlots <= 0 || !inviteTarget.isMember) {
      setError(
        inviteTarget && inviteTarget.openSlots <= 0
          ? t("web.friendsDock.inviteRosterFull")
          : t("web.friendsDock.inviteNoRoster")
      );
      return;
    }

    if (rosterMemberIds.has(friend.id) || invitedIds.has(friend.id)) {
      return;
    }

    setBusyId(`invite-${friend.id}`);
    setError(null);

    try {
      await inviteFriendToParty(inviteTarget.slug, friend.id, session.accessToken);
      setInvitedIds((current) => new Set(current).add(friend.id));
    } catch (error) {
      const apiMessage = isApiError(error) ? readApiErrorMessage(error.body) : null;

      setError(
        apiMessage === "This player declined an invite to this party"
          ? t("web.friendsDock.inviteDeclined")
          : t("dota.friends.actionError")
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!open) {
    return (
      <div className={styles.root}>
        <button
          aria-expanded={false}
          aria-label={t("web.friendsDock.tabAria", { count: String(incomingCount) })}
          className={`${styles.tab}${incomingCount > 0 ? ` ${styles.tabHasAlert}` : ""}`}
          onClick={() => {
            setOpen(true);
            void refresh();
          }}
          type="button"
        >
          <span aria-hidden="true" className={styles.tabIcon}>
            <UsersIcon />
          </span>
          <span className={styles.tabLabel}>{t("web.friendsDock.tab")}</span>
          {incomingCount > 0 ? <span className={styles.tabBadge}>{incomingCount}</span> : null}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <aside aria-label={t("web.friendsDock.panelAria")} className={styles.panel}>
        <button
          aria-expanded={true}
          className={styles.panelHead}
          onClick={() => setOpen(false)}
          type="button"
        >
          <h2 className={styles.panelHeadTitle}>{t("web.friendsDock.tab")}</h2>
          <span className={styles.collapseHint}>{t("web.friendsDock.collapse")}</span>
        </button>

        <Link className={styles.profile} href={accountHref}>
          <span aria-hidden="true" className={styles.avatar}>
            {session.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className={styles.avatarImage} src={session.avatarUrl} />
            ) : (
              resolveInitial(session.displayName)
            )}
          </span>
          <span className={styles.profileCopy}>
            <span className={styles.profileName}>{session.displayName}</span>
            <span className={styles.profileMeta}>{t("web.friendsDock.yourProfile")}</span>
          </span>
        </Link>

        <div className={styles.toolbar}>
          <button
            aria-pressed={tab === "requests"}
            className={`${styles.toolButton}${tab === "requests" ? ` ${styles.toolButtonActive}` : ""}`}
            onClick={() => setTab("requests")}
            title={t("web.friendsDock.requests")}
            type="button"
          >
            <span aria-hidden="true" className={styles.toolIcon}>
              <UserPlusIcon />
            </span>
            <span className={styles.toolLabel}>{t("web.friendsDock.requestsShort")}</span>
            {incomingCount > 0 ? <span className={styles.toolBadge}>{incomingCount}</span> : null}
          </button>
          <label className={styles.searchField}>
            <span className={styles.visuallyHidden}>{t("web.friendsDock.searchPlaceholder")}</span>
            <span aria-hidden="true" className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              className={styles.searchInput}
              onChange={(event) => {
                setFriendQuery(event.target.value);
                setTab("friends");
              }}
              onFocus={() => setTab("friends")}
              placeholder={t("web.friendsDock.searchPlaceholder")}
              ref={searchInputRef}
              type="search"
              value={friendQuery}
            />
          </label>
        </div>

        <div className={styles.body}>
          {error ? <p className={styles.error}>{error}</p> : null}

          {tab === "requests" ? (
            <>
              <p className={styles.sectionLabel}>{t("web.friendsDock.incoming")}</p>
              {incoming.length === 0 && outgoing.length === 0 ? (
                <p className={styles.empty}>{t("games.community.requestsEmpty")}</p>
              ) : (
                <ul className={styles.list}>
                  {incoming.map((request) => (
                    <li className={styles.row} key={request.id}>
                      <div className={styles.rowMain}>
                        <span aria-hidden="true" className={styles.avatar}>
                          {resolveInitial(request.otherUser.displayName)}
                        </span>
                        <div className={styles.rowCopy}>
                          <span className={styles.rowName}>{request.otherUser.displayName}</span>
                          <span className={styles.rowMeta}>{t("games.community.incomingFriend")}</span>
                        </div>
                      </div>
                      <div className={styles.rowActions}>
                        <button
                          className={`${styles.miniButton} ${styles.miniButtonPrimary}`}
                          disabled={busyId === request.id}
                          onClick={() => void handleAccept(request)}
                          type="button"
                        >
                          {t("dota.friends.accept")}
                        </button>
                        <button
                          className={styles.miniButton}
                          disabled={busyId === request.id}
                          onClick={() => void handleDecline(request)}
                          type="button"
                        >
                          {t("dota.friends.decline")}
                        </button>
                      </div>
                    </li>
                  ))}
                  {outgoing.map((request) => (
                    <li className={styles.row} key={request.id}>
                      <div className={styles.rowMain}>
                        <span aria-hidden="true" className={styles.avatar}>
                          {resolveInitial(request.otherUser.displayName)}
                        </span>
                        <div className={styles.rowCopy}>
                          <span className={styles.rowName}>{request.otherUser.displayName}</span>
                          <span className={styles.rowMeta}>{t("games.community.outgoingFriend")}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <p className={styles.sectionLabel}>
                {t("games.community.friendsTitle")}
                {friends.length > 0 ? ` · ${friends.length}` : ""}
              </p>
              {isLoading && friends.length === 0 ? (
                <p className={styles.muted}>{t("common.loadingEllipsis")}</p>
              ) : friends.length === 0 ? (
                <p className={styles.empty}>{t("games.community.friendsEmpty")}</p>
              ) : filteredFriends.length === 0 ? (
                <p className={styles.empty}>{t("web.friendsDock.searchEmpty")}</p>
              ) : (
                <ul className={styles.list}>
                  {filteredFriends.map((friend) => {
                    const alreadyInRoster = rosterMemberIds.has(friend.id);
                    const alreadyInvited = invitedIds.has(friend.id);
                    const inviteBusy = busyId === `invite-${friend.id}`;
                    const canInvite =
                      Boolean(inviteTarget?.isMember) &&
                      (inviteTarget?.openSlots ?? 0) > 0 &&
                      !alreadyInRoster &&
                      !alreadyInvited;

                    return (
                      <li className={styles.row} key={friend.id}>
                        {friend.dotaSlug ? (
                          <Link className={styles.rowMain} href={`/dota/${friend.dotaSlug}`}>
                            <span aria-hidden="true" className={styles.avatar}>
                              {resolveInitial(friend.displayName)}
                            </span>
                            <span className={styles.rowName} title={friend.displayName}>
                              {friend.displayName}
                            </span>
                          </Link>
                        ) : (
                          <div className={styles.rowMain}>
                            <span aria-hidden="true" className={styles.avatar}>
                              {resolveInitial(friend.displayName)}
                            </span>
                            <span className={styles.rowName} title={friend.displayName}>
                              {friend.displayName}
                            </span>
                          </div>
                        )}
                        <div className={styles.rowActions}>
                          {alreadyInRoster || alreadyInvited ? (
                            <span className={styles.rowStatus}>
                              {alreadyInRoster
                                ? t("web.friendsDock.alreadyInRoster")
                                : t("web.friendsDock.inviteSent")}
                            </span>
                          ) : (
                            <button
                              className={`${styles.miniButton} ${styles.miniButtonPrimary}`}
                              disabled={inviteBusy || !canInvite}
                              onClick={() => void handleInviteFriend(friend)}
                              title={
                                canInvite
                                  ? t("web.friendsDock.inviteToParty")
                                  : inviteTarget && inviteTarget.openSlots <= 0
                                    ? t("web.friendsDock.inviteRosterFull")
                                    : t("web.friendsDock.inviteNoRoster")
                              }
                              type="button"
                            >
                              {inviteBusy
                                ? t("web.friendsDock.inviteBusy")
                                : t("web.friendsDock.inviteToParty")}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button
            className={styles.inviteButton}
            disabled={busyId === "invite-link" || !profileNav.slug}
            onClick={() => void handleCopyFriendLink()}
            type="button"
          >
            {inviteCopied ? t("web.friendsDock.inviteCopied") : t("web.friendsDock.invite")}
          </button>
          {!profileNav.slug && !profileNav.isLoading ? (
            <p className={styles.muted}>{t("web.friendsDock.needProfile")}</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function resolveInviteTarget(
  partiesResponse: Awaited<ReturnType<typeof fetchMyParties>> | null,
  preferredSlug?: string | null
): GameParty | null {
  if (!partiesResponse) {
    return null;
  }

  const candidates = [
    partiesResponse.party,
    partiesResponse.team,
    ...(partiesResponse.parties ?? [])
  ].filter((party): party is GameParty => Boolean(party));

  const open = candidates.filter((party) => party.isMember && party.openSlots > 0);

  if (preferredSlug) {
    const preferred = open.find((party) => party.slug === preferredSlug);
    if (preferred) {
      return preferred;
    }
  }

  // Prefer temporary party over team when both have seats.
  return open.find((party) => party.kind === "PARTY") ?? open[0] ?? null;
}

function resolveInitial(displayName: string | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

function UserPlusIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24">
      <path
        d="M15 19a6 6 0 0 0-12 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M18 8v6M15 11h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg fill="none" viewBox="0 0 24 24">
      <path
        d="M16 19a5 5 0 0 0-10 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <circle cx="11" cy="9" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M18.5 19a4.2 4.2 0 0 0-2.2-3.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <circle cx="17" cy="9.5" r="2.3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
