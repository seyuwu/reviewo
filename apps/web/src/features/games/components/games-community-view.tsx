"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { OpiniaIcon } from "../../../components/opinia-icon";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { CreateRosterSplitButton } from "../../dota/components/create-roster-split-button";
import { useMyDotaProfileNav } from "../../dota/hooks/use-my-dota-profile-nav";
import { buildDotaFriendInviteUrl } from "../../dota/lib/share";
import { resolveInviteDecisionError } from "../lib/resolve-stack-invite-error";
import { useTranslation } from "../../i18n/locale-provider";
import {
  acceptFriendRequest,
  acceptPartyInvite,
  declineFriendRequest,
  declinePartyInvite,
  disbandGameParty,
  fetchFriendInviteToken,
  fetchFriendRequests,
  fetchFriends,
  fetchMyParties,
  leaveGameParty
} from "../../social/api/social-api";
import type {
  FriendUser,
  FriendshipRequest,
  GameParty,
  GamePartyInvite,
  MyPartiesResponse
} from "../../social/types/social";
import styles from "./games-community-view.module.css";

export function GamesCommunityView() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const profileNav = useMyDotaProfileNav();
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendshipRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendshipRequest[]>([]);
  const [parties, setParties] = useState<MyPartiesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!authSession?.accessToken) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setParties(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [friendsResponse, requestsResponse, partiesResponse] = await Promise.all([
        fetchFriends(authSession.accessToken),
        fetchFriendRequests(authSession.accessToken),
        fetchMyParties(authSession.accessToken)
      ]);

      setFriends(friendsResponse.friends);
      setIncomingRequests(requestsResponse.incoming);
      setOutgoingRequests(requestsResponse.outgoing);
      setParties(partiesResponse);
    } catch {
      setError(t("games.community.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [authSession?.accessToken, t]);

  useEffect(() => {
    if (!isAuthSessionLoaded) {
      return;
    }

    void refresh();
  }, [isAuthSessionLoaded, refresh]);

  const rosterList = useMemo(() => {
    if (!parties) {
      return [] as GameParty[];
    }

    const list: GameParty[] = [];

    if (parties.team) {
      list.push(parties.team);
    }

    const partyItems = parties.parties?.length
      ? parties.parties
      : parties.party
        ? [parties.party]
        : [];

    for (const party of partyItems) {
      if (!list.some((item) => item.id === party.id)) {
        list.push(party);
      }
    }

    return list;
  }, [parties]);

  const partyInvites = parties?.invites.filter((invite) => invite.inviteKind !== "APPLICATION") ?? [];
  const myApplications =
    parties?.invites.filter((invite) => invite.inviteKind === "APPLICATION") ?? [];
  const pendingApplications =
    parties?.outgoingInvites.filter(
      (invite) => invite.status === "PENDING" && invite.inviteKind === "APPLICATION"
    ) ?? [];

  async function handleAcceptFriend(request: FriendshipRequest) {
    if (!authSession?.accessToken) {
      return;
    }

    setBusyId(request.id);

    try {
      await acceptFriendRequest(request.id, authSession.accessToken);
      await refresh();
      setFeedback(t("games.community.friendAccepted"));
    } catch {
      setError(t("dota.friends.actionError"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeclineFriend(request: FriendshipRequest) {
    if (!authSession?.accessToken) {
      return;
    }

    setBusyId(request.id);

    try {
      await declineFriendRequest(request.id, authSession.accessToken);
      await refresh();
    } catch {
      setError(t("dota.friends.actionError"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAcceptPartyInvite(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setBusyId(invite.id);
    setError(null);

    try {
      const joined = await acceptPartyInvite(invite.id, authSession.accessToken);
      // Invitee → team page; captain accepting an application stays put.
      if (invite.inviteKind !== "APPLICATION") {
        router.push(`/dota/teams/${joined.slug}`);
      } else {
        await refresh();
      }
    } catch (acceptError) {
      setError(resolveInviteDecisionError(acceptError, t));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeclinePartyInvite(invite: GamePartyInvite) {
    if (!authSession?.accessToken) {
      return;
    }

    setBusyId(invite.id);
    setError(null);

    try {
      await declinePartyInvite(invite.id, authSession.accessToken);
      await refresh();
    } catch (declineError) {
      setError(resolveInviteDecisionError(declineError, t));
    } finally {
      setBusyId(null);
    }
  }

  async function handleLeaveRoster(roster: GameParty) {
    if (!authSession?.accessToken) {
      return;
    }

    const confirmed = window.confirm(
      roster.isOwner
        ? t("games.community.disbandConfirm", { name: roster.name })
        : t("games.community.leaveConfirm", { name: roster.name })
    );

    if (!confirmed) {
      return;
    }

    setBusyId(`roster-${roster.id}`);
    setError(null);

    try {
      if (roster.isOwner) {
        await disbandGameParty(roster.slug, authSession.accessToken);
        setFeedback(t("games.community.disbandSuccess"));
      } else {
        await leaveGameParty(roster.slug, authSession.accessToken);
        setFeedback(t("games.community.leaveSuccess"));
      }
      await refresh();
    } catch {
      setError(
        roster.isOwner ? t("games.community.disbandError") : t("dota.team.leaveError")
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopyFriendInvite() {
    if (!authSession?.accessToken || !profileNav.slug) {
      return;
    }

    try {
      const { token } = await fetchFriendInviteToken(authSession.accessToken);
      const url = buildDotaFriendInviteUrl(profileNav.slug, token);
      await navigator.clipboard.writeText(url);
      setInviteCopied(true);
      setFeedback(t("games.community.inviteCopied"));
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setError(t("dota.friends.actionError"));
    }
  }

  if (!isAuthSessionLoaded) {
    return (
      <section className={styles.page}>
        <p className={styles.muted}>{t("common.loadingEllipsis")}</p>
      </section>
    );
  }

  if (!authSession) {
    return (
      <section className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t("games.community.pageTitle")}</h1>
          <p className={styles.lead}>{t("games.community.pageLead")}</p>
        </header>
        <div className={styles.gate}>
          <OpiniaIcon name="spotlight" />
          <h2>{t("games.community.signInTitle")}</h2>
          <p>{t("games.community.signInLead")}</p>
          <Link className="button-primary" href="/dota/create">
            {t("games.community.signInCta")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <h1 className={styles.title}>{t("games.community.pageTitle")}</h1>
          <p className={styles.lead}>{t("games.community.pageLead")}</p>
        </div>
        <div className={styles.headerActions}>
          <CreateRosterSplitButton disableTeam={Boolean(parties?.team)} />
          <Link className="button-secondary" href="/games/search">
            {t("games.community.openSearch")}
          </Link>
          {profileNav.hasProfile ? (
            <button className="button-primary" onClick={() => void handleCopyFriendInvite()} type="button">
              {inviteCopied ? t("games.community.inviteCopied") : t("games.community.copyFriendInvite")}
            </button>
          ) : (
            <Link className="button-primary" href="/dota/create">
              {t("games.hub.createProfile")}
            </Link>
          )}
        </div>
      </header>

      <div className={styles.stats}>
        <article className={styles.stat}>
          <span>{t("games.community.statFriends")}</span>
          <strong>{friends.length}</strong>
        </article>
        <article className={styles.stat}>
          <span>{t("games.community.statRosters")}</span>
          <strong>{rosterList.length}</strong>
        </article>
        <article className={styles.stat}>
          <span>{t("games.community.statPending")}</span>
          <strong>{incomingRequests.length + partyInvites.length + pendingApplications.length + myApplications.length}</strong>
        </article>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {feedback ? <p className={styles.feedback}>{feedback}</p> : null}

      {isLoading ? (
        <p className={styles.muted}>{t("common.loadingEllipsis")}</p>
      ) : (
        <div className={styles.grid}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>{t("games.community.rostersTitle")}</h2>
                <p className={styles.panelHint}>{t("games.community.rostersHint")}</p>
              </div>
            </div>

            {rosterList.length === 0 ? (
              <div className={styles.empty}>
                <OpiniaIcon name="battle" />
                <p>{t("games.community.rostersEmpty")}</p>
              </div>
            ) : (
              <ul className={styles.list}>
                {rosterList.map((roster) => (
                  <li className={styles.row} key={roster.id}>
                    <div className={styles.rowCopy}>
                      <div>
                        <span className={styles.rowBadge}>
                          {roster.kind === "TEAM"
                            ? t("dota.team.kindTeam")
                            : t("dota.team.kindParty")}
                        </span>
                        <strong>{roster.name}</strong>
                        <span className={styles.rowMeta}>
                          {t("games.community.rosterSlots", {
                            current: String(roster.memberCount),
                            max: String(roster.maxMembers)
                          })}
                          {roster.isOwner ? ` · ${t("dota.team.roleOwner")}` : ""}
                        </span>
                      </div>
                    </div>
                    <div className={styles.inlineActions}>
                      <Link className="button-secondary" href={`/dota/teams/${roster.slug}`}>
                        {t("games.community.openRoster")}
                      </Link>
                      <button
                        className={styles.dangerButton}
                        disabled={busyId === `roster-${roster.id}`}
                        onClick={() => void handleLeaveRoster(roster)}
                        type="button"
                      >
                        {roster.isOwner
                          ? t("games.community.disbandRoster")
                          : t("games.community.leaveRoster")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>{t("games.community.friendsTitle")}</h2>
                <p className={styles.panelHint}>{t("games.community.friendsHint")}</p>
              </div>
              <Link className="button-secondary" href="/dota#dota-account-id-search">
                {t("games.community.findPlayers")}
              </Link>
            </div>

            {friends.length === 0 ? (
              <div className={styles.empty}>
                <OpiniaIcon name="spotlight" />
                <p>{t("games.community.friendsEmpty")}</p>
              </div>
            ) : (
              <ul className={styles.list}>
                {friends.map((friend) => (
                  <li className={styles.row} key={friend.id}>
                    <div className={styles.rowCopy}>
                      <span aria-hidden="true" className={styles.avatar}>
                        {friend.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <strong>{friend.displayName}</strong>
                        <span className={styles.rowMeta}>
                          {friend.dotaSlug
                            ? t("games.community.hasProfile")
                            : t("games.community.noProfile")}
                        </span>
                      </div>
                    </div>
                    {friend.dotaSlug ? (
                      <Link className="button-secondary" href={`/dota/${friend.dotaSlug}`}>
                        {t("games.community.openProfile")}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>{t("games.community.requestsTitle")}</h2>
                <p className={styles.panelHint}>{t("games.community.requestsHint")}</p>
              </div>
              {incomingRequests.length > 0 ? (
                <span className={styles.count}>{incomingRequests.length}</span>
              ) : null}
            </div>

            {incomingRequests.length === 0 && outgoingRequests.length === 0 ? (
              <p className={styles.muted}>{t("games.community.requestsEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {incomingRequests.map((request) => (
                  <li className={styles.row} key={request.id}>
                    <div className={styles.rowCopy}>
                      <strong>{request.otherUser.displayName}</strong>
                      <span className={styles.rowMeta}>{t("games.community.incomingFriend")}</span>
                    </div>
                    <div className={styles.inlineActions}>
                      <button
                        className="button-primary"
                        disabled={busyId === request.id}
                        onClick={() => void handleAcceptFriend(request)}
                        type="button"
                      >
                        {t("dota.friends.accept")}
                      </button>
                      <button
                        className="button-secondary"
                        disabled={busyId === request.id}
                        onClick={() => void handleDeclineFriend(request)}
                        type="button"
                      >
                        {t("dota.friends.decline")}
                      </button>
                    </div>
                  </li>
                ))}
                {outgoingRequests.map((request) => (
                  <li className={styles.row} key={request.id}>
                    <div className={styles.rowCopy}>
                      <strong>{request.otherUser.displayName}</strong>
                      <span className={styles.rowMeta}>{t("games.community.outgoingFriend")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>{t("games.community.invitesTitle")}</h2>
                <p className={styles.panelHint}>{t("games.community.invitesHint")}</p>
              </div>
              {partyInvites.length + pendingApplications.length + myApplications.length > 0 ? (
                <span className={styles.count}>
                  {partyInvites.length + pendingApplications.length + myApplications.length}
                </span>
              ) : null}
            </div>

            {partyInvites.length === 0 &&
            pendingApplications.length === 0 &&
            myApplications.length === 0 ? (
              <p className={styles.muted}>{t("games.community.invitesEmpty")}</p>
            ) : (
              <ul className={styles.list}>
                {partyInvites.map((invite) => (
                  <li className={styles.row} key={invite.id}>
                    <div className={styles.rowCopy}>
                      <strong>{invite.partyName}</strong>
                      <span className={styles.rowMeta}>
                        {invite.kind === "PARTY"
                          ? t("games.search.inviteParty")
                          : t("games.search.inviteTeam")}
                      </span>
                    </div>
                    <div className={styles.inlineActions}>
                      <button
                        className="button-primary"
                        disabled={busyId === invite.id}
                        onClick={() => void handleAcceptPartyInvite(invite)}
                        type="button"
                      >
                        {t("games.search.inviteAccept")}
                      </button>
                      <button
                        className="button-secondary"
                        disabled={busyId === invite.id}
                        onClick={() => void handleDeclinePartyInvite(invite)}
                        type="button"
                      >
                        {t("games.search.inviteDecline")}
                      </button>
                    </div>
                  </li>
                ))}
                {myApplications.map((invite) => (
                  <li className={styles.row} key={invite.id}>
                    <div className={styles.rowCopy}>
                      <strong>{invite.partyName}</strong>
                      <span className={styles.rowMeta}>
                        {t("games.search.applicationPending", {
                          role: invite.positionRole ?? "—"
                        })}
                      </span>
                    </div>
                    <button
                      className="button-secondary"
                      disabled={busyId === invite.id}
                      onClick={() => void handleDeclinePartyInvite(invite)}
                      type="button"
                    >
                      {t("games.search.withdrawApplication")}
                    </button>
                  </li>
                ))}
                {pendingApplications.map((invite) => (
                  <li className={styles.row} key={invite.id}>
                    <div className={styles.rowCopy}>
                      {invite.inviteeDotaSlug ? (
                        <Link href={`/dota/${invite.inviteeDotaSlug}`}>
                          <strong>{invite.inviteeDisplayName}</strong>
                        </Link>
                      ) : (
                        <strong>{invite.inviteeDisplayName}</strong>
                      )}
                      <span className={styles.rowMeta}>
                        {t("games.search.applicationForRole", {
                          role: invite.positionRole ?? "—"
                        })}
                      </span>
                    </div>
                    <div className={styles.inlineActions}>
                      <button
                        className="button-primary"
                        disabled={busyId === invite.id}
                        onClick={() => void handleAcceptPartyInvite(invite)}
                        type="button"
                      >
                        {t("games.search.acceptApplication")}
                      </button>
                      <button
                        className="button-secondary"
                        disabled={busyId === invite.id}
                        onClick={() => void handleDeclinePartyInvite(invite)}
                        type="button"
                      >
                        {t("games.search.declineApplication")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
