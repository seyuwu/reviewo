"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { fetchMyDotaProfile } from "../../dota/api/dota-api";
import type { DotaProfile } from "../../dota/types/dota";
import { useTranslation } from "../../i18n/locale-provider";
import { getCurrentUserProfile } from "../../profile/api/profile";
import { DotaTournamentBracket } from "./dota-tournament-bracket";
import { DotaTournamentPodium } from "./dota-tournament-podium";
import { TournamentBackLink } from "./tournament-back-link";
import {
  assignDotaTournamentEntryPosition,
  createDotaTournamentSquad,
  decideDotaTournamentJoinRequest,
  fetchDotaTournament,
  fetchDotaTournamentManagedEntries,
  joinDotaTournamentEntry,
  leaveDotaTournamentEntry,
  setDotaTournamentEntryJoinMode,
  withdrawDotaTeamFromTournament
} from "../api/dota-tournaments-api";
import type { DotaTournament, DotaTournamentManagedEntry } from "../types/dota-tournament";
import { formatDate, statusLabel } from "./dota-tournaments-view";
import { tournamentRoomUrl } from "../api/tournament-rooms-api";
import { fetchTournamentPlan } from "../api/tournament-plans-api";
import styles from "./dota-tournaments-view.module.css";

export function DotaTournamentDetailView({ slug }: { slug: string }) {
  const t = useTranslation();
  const router = useRouter();
  const { authSession } = useAuthSession();
  const [tournament, setTournament] = useState<DotaTournament | null>(null);
  const [managedBracket, setManagedBracket] = useState<DotaTournament | null>(null);
  const hasBracket = Boolean(tournament?.bracket || tournament?.matches?.length);
  const [bracketOpen, setBracketOpen] = useState(false);
  const [refreshingBracket, setRefreshingBracket] = useState(false);
  async function refreshTournament() {
    setRefreshingBracket(true);
    try {
      const updated = await fetchDotaTournament(slug);
      setTournament(updated);
      if (canReviewChats && authSession?.accessToken && updated.automaticBracket) {
        setManagedBracket(await fetchTournamentPlan(slug, authSession.accessToken).catch(() => null));
      } else {
        setManagedBracket(null);
      }
    } catch {
      setJoinError(t("dota.tournaments.loadError"));
    } finally {
      setRefreshingBracket(false);
    }
  }
  const [myProfile, setMyProfile] = useState<DotaProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinFeedback, setJoinFeedback] = useState<string | null>(null);
  const [managedEntries, setManagedEntries] = useState<DotaTournamentManagedEntry[]>([]);
  const [managedEntriesLoaded, setManagedEntriesLoaded] = useState(false);
  const [createSquadOpen, setCreateSquadOpen] = useState(false);
  const [squadName, setSquadName] = useState("");
  const [captainRole, setCaptainRole] = useState("");
  const [squadJoinMode, setSquadJoinMode] = useState<"OPEN" | "CONFIRM">("CONFIRM");
  const [createSquadBusy, setCreateSquadBusy] = useState(false);
  const [copiedEntryId, setCopiedEntryId] = useState<string | null>(null);
  const [inviteHashHandled, setInviteHashHandled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [canReviewChats, setCanReviewChats] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    setCanReviewChats(false);
    if (!authSession?.accessToken) return;
    let active = true;
    void getCurrentUserProfile(authSession.accessToken).then((profile) => {
      if (active) setCanReviewChats(profile.role === "ADMIN" || profile.role === "TOURNAMENT_MODERATOR");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [authSession?.accessToken]);

  useEffect(() => {
    setManagedBracket(null);
    if (!canReviewChats || !authSession?.accessToken || !tournament?.automaticBracket) return;
    let active = true;
    void fetchTournamentPlan(slug, authSession.accessToken)
      .then((plan) => { if (active) setManagedBracket(plan); })
      .catch(() => { if (active) setManagedBracket(null); });
    return () => { active = false; };
  }, [authSession?.accessToken, canReviewChats, slug, tournament?.automaticBracket]);

  useEffect(() => {
    let active = true;
    void fetchDotaTournament(slug)
      .then((item) => {
        if (active) setTournament(item);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      setMyProfile(null);
      setProfileLoaded(true);
      return;
    }
    let active = true;
    setProfileLoaded(false);
    void fetchMyDotaProfile(authSession.accessToken)
      .then((profile) => {
        if (active) setMyProfile(profile);
      })
      .catch(() => {
        if (active) setMyProfile(null);
      })
      .finally(() => {
        if (active) setProfileLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [authSession?.accessToken]);

  useEffect(() => {
    if (!authSession?.accessToken) {
      setManagedEntries([]);
      setManagedEntriesLoaded(true);
      return;
    }
    let active = true;
    setManagedEntriesLoaded(false);
    void fetchDotaTournamentManagedEntries(slug, authSession.accessToken)
      .then((entries) => {
        if (active) {
          setManagedEntries(entries);
          setManagedEntriesLoaded(true);
        }
      })
      .catch(() => {
        if (active) {
          setManagedEntries([]);
          setManagedEntriesLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [authSession?.accessToken, slug]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !tournament ||
      inviteHashHandled ||
      !window.location.hash.startsWith("#entry-")
    ) {
      return;
    }
    const entryId = window.location.hash.slice("#entry-".length);
    setInviteHashHandled(true);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`entry-${entryId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [inviteHashHandled, tournament?.slug]);

  useEffect(() => {
    setInviteHashHandled(false);
    setBracketOpen(window.location.hash === "#tournament-bracket");
  }, [slug]);

  useEffect(() => {
    if (bracketOpen && tournament?.status === "COMPLETED") {
      const frame = window.requestAnimationFrame(() => {
        document
          .getElementById("tournament-bracket")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [bracketOpen, tournament?.status]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("create") === "1"
    ) {
      setCreateSquadOpen(true);
      document.getElementById("registered-teams")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [slug]);

  useEffect(() => {
    if (!captainRole && myProfile?.roles.length) setCaptainRole(myProfile.roles[0] ?? "");
  }, [captainRole, myProfile]);

  async function refreshManagedEntries() {
    if (!authSession?.accessToken) return;
    try {
      setManagedEntries(await fetchDotaTournamentManagedEntries(slug, authSession.accessToken));
    } catch {
      setManagedEntries([]);
    }
  }

  async function handleCreateSquad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authSession?.accessToken || !tournament || createSquadBusy) return;
    setCreateSquadBusy(true);
    setJoinError(null);
    setJoinFeedback(null);
    try {
      const updated = await createDotaTournamentSquad(
        tournament.slug,
        {
          joinMode: squadJoinMode,
          name: squadName,
          positionRole: captainRole as "1" | "2" | "3" | "4" | "5"
        },
        authSession.accessToken
      );
      setTournament(updated);
      setCreateSquadOpen(false);
      setSquadName("");
      setJoinFeedback(t("dota.tournaments.squadCreated"));
      const created = updated.entries.find((entry) =>
        entry.members.some((member) => member.dotaProfileSlug === myProfile?.slug));
      if (created) router.push(tournamentRoomUrl(slug, created.id));
      await refreshManagedEntries();
    } catch {
      setJoinError(t("dota.tournaments.squadCreateError"));
    } finally {
      setCreateSquadBusy(false);
    }
  }

  async function handleRequestDecision(
    entryId: string,
    requestId: string,
    decision: "ACCEPT" | "DECLINE"
  ) {
    if (!authSession?.accessToken || !tournament || busyEntryId) return;
    setBusyEntryId(entryId);
    setJoinError(null);
    try {
      const result = await decideDotaTournamentJoinRequest(
        tournament.slug,
        entryId,
        requestId,
        decision,
        authSession.accessToken
      );
      setTournament(result.tournament);
      await refreshManagedEntries();
    } catch {
      setJoinError(t("dota.tournaments.manageEntryError"));
    } finally {
      setBusyEntryId(null);
    }
  }

  async function handleJoinModeChange(entryId: string, joinMode: "OPEN" | "CONFIRM") {
    if (!authSession?.accessToken || !tournament || busyEntryId) return;
    setBusyEntryId(entryId);
    setJoinError(null);
    try {
      await setDotaTournamentEntryJoinMode(
        tournament.slug,
        entryId,
        joinMode,
        authSession.accessToken
      );
      setManagedEntries((entries) =>
        entries.map((entry) => (entry.entryId === entryId ? { ...entry, joinMode } : entry))
      );
    } catch {
      setJoinError(t("dota.tournaments.manageEntryError"));
    } finally {
      setBusyEntryId(null);
    }
  }

  async function handleWithdrawEntry(entryId: string) {
    if (!authSession?.accessToken || !tournament || busyEntryId) return;
    setBusyEntryId(entryId);
    setJoinError(null);
    try {
      const updated = await withdrawDotaTeamFromTournament(
        tournament.slug,
        entryId,
        authSession.accessToken
      );
      setTournament(updated);
      setManagedEntries((entries) => entries.filter((entry) => entry.entryId !== entryId));
      setJoinFeedback(t("dota.tournaments.squadWithdrawn"));
    } catch {
      setJoinError(t("dota.tournaments.manageEntryError"));
    } finally {
      setBusyEntryId(null);
    }
  }

  async function handleCopyInvite(entryId: string) {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(
        window.location.origin + tournamentRoomUrl(slug, entryId)
      );
      setCopiedEntryId(entryId);
      window.setTimeout(
        () => setCopiedEntryId((current) => (current === entryId ? null : current)),
        1800
      );
    } catch {
      setJoinError(t("dota.tournaments.inviteCopyError"));
    }
  }

  async function handleJoin(entryId: string, positionRole: string) {
    if (!authSession?.accessToken || !tournament || busyEntryId) return;
    setBusyEntryId(entryId);
    setJoinError(null);
    setJoinFeedback(null);
    try {
      const result = await joinDotaTournamentEntry(
        tournament.slug,
        entryId,
        positionRole as "1" | "2" | "3" | "4" | "5",
        authSession.accessToken
      );
      setTournament(result.tournament);
      setJoinFeedback(
        result.result === "JOINED"
          ? t("dota.tournaments.joinedTournament")
          : t("dota.tournaments.requestSent")
      );
    } catch {
      setJoinError(t("dota.tournaments.joinError"));
    } finally {
      setBusyEntryId(null);
    }
  }

  async function handleAssignPosition(entryId: string, positionRole: string) {
    if (!authSession?.accessToken || busyEntryId) return;
    setBusyEntryId(entryId);
    setJoinError(null);
    try {
      setTournament(
        await assignDotaTournamentEntryPosition(
          slug,
          entryId,
          positionRole,
          authSession.accessToken
        )
      );
      await refreshManagedEntries();
    } catch {
      setJoinError(t("dota.tournaments.manageEntryError"));
    } finally {
      setBusyEntryId(null);
    }
  }

  async function handleLeave(entryId: string) {
    if (!authSession?.accessToken || !tournament || busyEntryId) return;
    setBusyEntryId(entryId);
    setJoinError(null);
    setJoinFeedback(null);
    try {
      const result = await leaveDotaTournamentEntry(
        tournament.slug,
        entryId,
        authSession.accessToken
      );
      setTournament(result.tournament);
      setJoinFeedback(t("dota.tournaments.leftTournament"));
    } catch {
      setJoinError(t("dota.tournaments.joinError"));
    } finally {
      setBusyEntryId(null);
    }
  }

  if (loading) return <p className={styles.muted}>{t("common.loadingEllipsis")}</p>;
  if (failed || !tournament) {
    return (
      <section className={styles.page}>
        <p className={styles.empty}>{t("dota.tournaments.loadError")}</p>
        <Link className="button-secondary" href="/games/tournaments">
          {t("dota.tournaments.backToTournaments")}
        </Link>
      </section>
    );
  }

  const ownEntry = tournament.entries.find((entry) =>
    entry.members.some((member) => !!member.dotaProfileSlug && member.dotaProfileSlug === myProfile?.slug));
  const entriesByStatus = [...tournament.entries].sort((left, right) =>
    Number(left.status === "RESERVE") - Number(right.status === "RESERVE")
  );
  const visibleEntries = ownEntry
    ? [ownEntry, ...entriesByStatus.filter((entry) => entry.id !== ownEntry.id)]
    : entriesByStatus;
  return (
    <section className={styles.page}>
      <TournamentBackLink href="/games/tournaments">
        {t("dota.tournaments.backToTournaments")}
      </TournamentBackLink>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{t("dota.tournaments.eyebrow")}</p>
          <h1>{tournament.title}</h1>
          <p>{tournament.description || t("dota.tournaments.noDescription")}</p>
          <div className={styles.meta}>
            <span className={styles.status}>{statusLabel(tournament.status, t)}</span>
            {tournament.format ? <span>{tournament.format}</span> : null}
            {tournament.startsAt ? (
              <span>
                {t("dota.tournaments.startsAt", { date: formatDate(tournament.startsAt) })}
              </span>
            ) : null}
            {tournament.registrationClosesAt ? (
              <span>
                {t("dota.tournaments.registrationUntil", {
                  date: formatDate(tournament.registrationClosesAt)
                })}
              </span>
            ) : null}
            <span>
              {t("dota.tournaments.teamCount", {
                count: String(tournament.registeredTeams),
                max: tournament.maxTeams ? String(tournament.maxTeams) : "∞"
              })}
            </span>
          </div>
        </div>
        <div className={styles.heroActions}>
        {ownEntry ? (
          <Link className="button-primary" href={tournamentRoomUrl(slug, ownEntry.id)}>
            {t("dota.tournaments.room.myTeam")}
          </Link>
        ) : tournament.status === "REGISTRATION_OPEN" ? (
          <button
            className={`button-primary ${styles.teamSignupPrimary}`}
            onClick={() => {
              setCreateSquadOpen(true);
              document.getElementById("registered-teams")?.scrollIntoView({ behavior: "smooth" });
            }}
            type="button"
          >
            {t("dota.tournaments.joinOrCreateTeam")}
          </button>
        ) : null}
        {canReviewChats ? <Link className="button-secondary" href={"/games/tournaments/manage/" + encodeURIComponent(tournament.slug)}>
          {t("dota.tournaments.bracket.settings")}
        </Link> : null}
        {tournament.rulesUrl ? (
          <a className="button-secondary" href={tournament.rulesUrl} rel="noreferrer" target="_blank">
            {t("dota.tournaments.rules")}
          </a>
        ) : (
          <button className="button-secondary" type="button" aria-expanded={rulesOpen}
            aria-controls="tournament-rules" onClick={() => setRulesOpen((open) => !open)}>
            {t("dota.tournaments.rules")}
          </button>
        )}
        </div>
      </header>

      {rulesOpen && !tournament.rulesUrl ? (
        <section className={styles.rulesPanel} id="tournament-rules">
          <h2>{t("dota.tournaments.rules")}</h2>
          <dl>
            <div><dt>{t("dota.tournaments.admin.gameModeLabel")}</dt><dd>{t(`dota.tournaments.mode.${tournament.gameMode}` as never)}</dd></div>
            <div><dt>{t("dota.tournaments.admin.serverRegionLabel")}</dt><dd>{t(`dota.tournaments.region.${tournament.serverRegion}` as never)}</dd></div>
          </dl>
          <div className={styles.meta}>
            <span>{t(tournament.allowSpectators ? "dota.tournaments.spectatorsEnabled" : "dota.tournaments.spectatorsDisabled")}</span>
            <span>{t(tournament.cheatsEnabled ? "dota.tournaments.cheatsEnabled" : "dota.tournaments.cheatsDisabled")}</span>
            {tournament.automaticBracket ? <span>{t(tournament.bracketFormat === "DOUBLE_ELIMINATION"
              ? "dota.tournaments.bracket.double" : "dota.tournaments.bracket.single")}</span> : null}
          </div>
        </section>
      ) : null}

      {tournament.status === "COMPLETED" ? (
        <>
          <DotaTournamentPodium tournament={tournament} />
          <button
            className="button-primary"
            type="button"
            aria-expanded={bracketOpen}
            onClick={() => setBracketOpen((open) => !open)}
          >
            {bracketOpen ? t("dota.tournaments.bracket.hide") : t("dota.tournaments.bracket.show")}
          </button>
        </>
      ) : null}
      {tournament.status !== "COMPLETED" || bracketOpen || canReviewChats ? (
        <>
          {hasBracket && (tournament.status !== "COMPLETED" || bracketOpen) ? (
            <>
              <DotaTournamentBracket
                tournament={managedBracket ?? tournament}
                {...(canReviewChats && authSession?.accessToken && managedBracket ? { editor: {
                  token: authSession.accessToken,
                  onSaved: refreshTournament
                } } : {})}
              />
              {tournament.status !== "COMPLETED" ? (
                <button
                  className="button-secondary"
                  type="button"
                  disabled={refreshingBracket}
                  onClick={() => void refreshTournament()}
                >
                  {t("dota.tournaments.bracket.refresh")}
                </button>
              ) : null}
            </>
          ) : null}
          {tournament.status !== "COMPLETED" || canReviewChats ? (
            <>
              <div className={styles.teamHeading} id="registered-teams">
                <div>
                  <h2>{t("dota.tournaments.registeredTeams")}</h2>
                  <p>{t("dota.tournaments.teamsLead")}</p>
                </div>
                {tournament.status === "REGISTRATION_OPEN" ? (
                  <button
                    className="button-secondary"
                    disabled={!!ownEntry}
                    title={ownEntry ? t("dota.team.createTeamDisabled") : undefined}
                    onClick={() => setCreateSquadOpen((open) => !open)}
                    type="button"
                  >
                    {createSquadOpen
                      ? t("dota.tournaments.cancelCreateSquad")
                      : t("dota.tournaments.createSquad")}
                  </button>
                ) : null}
              </div>
              {createSquadOpen && !ownEntry && tournament.status === "REGISTRATION_OPEN" ? (
                <section className={styles.squadCreatePanel}>
                  <div>
                    <h3>{t("dota.tournaments.createSquadTitle")}</h3>
                    <p>{t("dota.tournaments.createSquadLead")}</p>
                  </div>
                  {!authSession?.accessToken ? (
                    <Link className="button-primary" href="/profile">
                      {t("dota.tournaments.signInToJoin")}
                    </Link>
                  ) : !profileLoaded ? (
                    <p className={styles.muted}>{t("common.loadingEllipsis")}</p>
                  ) : !myProfile ? (
                    <Link className="button-primary" href="/dota/create">
                      {t("dota.tournaments.createProfileToJoin")}
                    </Link>
                  ) : (
                    <form
                      className={styles.squadCreateForm}
                      onSubmit={(event) => void handleCreateSquad(event)}
                    >
                      <label>
                        <span>{t("dota.tournaments.squadName")}</span>
                        <input
                          maxLength={80}
                          minLength={2}
                          onChange={(event) => setSquadName(event.target.value)}
                          required
                          value={squadName}
                        />
                      </label>
                      <label>
                        <span>{t("dota.tournaments.captainPosition")}</span>
                        <select
                          onChange={(event) => setCaptainRole(event.target.value)}
                          required
                          value={captainRole}
                        >
                          {myProfile.roles.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role, t)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>{t("dota.tournaments.teamJoinMode")}</span>
                        <select
                          onChange={(event) =>
                            setSquadJoinMode(event.target.value as "OPEN" | "CONFIRM")
                          }
                          value={squadJoinMode}
                        >
                          <option value="CONFIRM">{t("dota.tournaments.requestJoin")}</option>
                          <option value="OPEN">{t("dota.tournaments.openJoin")}</option>
                        </select>
                      </label>
                      <button
                        className="button-primary"
                        disabled={createSquadBusy || !captainRole}
                        type="submit"
                      >
                        {createSquadBusy
                          ? t("common.loadingEllipsis")
                          : t("dota.tournaments.createSquad")}
                      </button>
                    </form>
                  )}
                </section>
              ) : null}
              {tournament.entries.length === 0 ? (
                <div className={styles.emptyState}>
                  <span aria-hidden="true">♟</span>
                  <h2>{t("dota.tournaments.noTeamsTitle")}</h2>
                  <p>{t("dota.tournaments.noTeamsLead")}</p>
                </div>
              ) : (
                <div className={styles.grid}>
                  {visibleEntries.map((entry) => {
                    const isCurrentMember = entry.members.some(
                      (member) =>
                        member.dotaProfileSlug && member.dotaProfileSlug === myProfile?.slug
                    );
                    const registrationWindowOpen = tournament.status === "REGISTRATION_OPEN" &&
                      (!tournament.registrationClosesAt || Date.parse(tournament.registrationClosesAt) > Date.now());
                    const reserveWindowOpen = entry.status === "RESERVE" &&
                      tournament.status === "REGISTRATION_CLOSED";
                    const canJoin =
                      (registrationWindowOpen || reserveWindowOpen) &&
                      entry.members.length < 5 &&
                      !isCurrentMember;
                    const reserveJoinOpen = reserveWindowOpen && entry.members.length < 5;
                    const mayManageEntry = registrationWindowOpen || reserveWindowOpen;
                    const unassignedMembers = entry.members.filter(
                      (member) =>
                        !member.positionRole ||
                        !TOURNAMENT_ROLES.includes(
                          member.positionRole as (typeof TOURNAMENT_ROLES)[number]
                        )
                    );

                    return (
                      <article className={styles.teamCard} id={`entry-${entry.id}`} key={entry.id}
                        onClick={(event) => {
                          if (!(event.target instanceof HTMLElement) ||
                            event.target.closest("a,button,input,select,textarea,label")) return;
                          router.push(tournamentRoomUrl(slug, entry.id));
                        }}>
                        <div className={styles.teamCardTop}>
                          <h3><Link href={tournamentRoomUrl(slug, entry.id)}>{entry.teamName}</Link></h3>
                          <div className={styles.teamCardBadges}>
                            <span
                              className={`${styles.status} ${entry.status === "RECRUITING" ? styles.recruiting : entry.status === "RESERVE" ? styles.reserve : ""}`}
                              title={entry.status === "RESERVE" ? t("dota.tournaments.reserveHint") : undefined}
                            >
                              {entry.status === "RESERVE"
                                ? reserveJoinOpen
                                  ? t("dota.tournaments.reserveJoinOpen")
                                  : t("dota.tournaments.reserveStatus")
                                : entry.status === "RECRUITING"
                                ? tournament.status === "REGISTRATION_OPEN"
                                  ? t("dota.tournaments.recruiting")
                                  : t("dota.tournaments.recruitingClosed")
                                : t("dota.tournaments.lineupComplete")}
                            </span>
                            <span>
                              {t("dota.tournaments.rosterCount", {
                                current: String(entry.members.length),
                                max: "5"
                              })}
                            </span>
                          </div>
                        </div>
                        <ul className={styles.memberList}>
                          {TOURNAMENT_ROLES.map((role) => {
                            const member = entry.members.find(
                              (candidate) => candidate.positionRole === role
                            );
                            return (
                              <li
                                className={!member ? styles.emptySlot : undefined}
                                key={`${entry.id}-${role}`}
                              >
                                <span className={styles.position}>{role}</span>
                                <span className={styles.playerName}>
                                  <span className={styles.roleName}>{roleLabel(role, t)}</span>
                                  {member?.dotaProfileSlug ? (
                                    <Link
                                      href={`/dota/${encodeURIComponent(member.dotaProfileSlug)}`}
                                    >
                                      {member.displayName}
                                    </Link>
                                  ) : (
                                    (member?.displayName ?? t("dota.tournaments.freePosition"))
                                  )}
                                </span>
                                <span className={styles.mmr}>
                                  {member?.mmr ? `${member.mmr} MMR` : member ? "— MMR" : ""}
                                </span>
                              </li>
                            );
                          })}
                          {unassignedMembers.map((member, index) => (
                            <li
                              className={styles.emptySlot}
                              key={`${entry.id}-unassigned-${member.dotaProfileSlug ?? index}`}
                            >
                              <span className={styles.position}>—</span>
                              <span className={styles.playerName}>
                                {member.dotaProfileSlug ? <Link href={"/dota/" + encodeURIComponent(member.dotaProfileSlug)}>{member.displayName}</Link> : member.displayName}
                                {" · "}{t("dota.tournaments.unassignedPosition")}
                              </span>
                              <span className={styles.mmr}>
                                {member.mmr ? `${member.mmr} MMR` : "— MMR"}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {entry.status === "RESERVE" ? (
                          <p className={styles.reserveHint}>{t("dota.tournaments.reserveHint")}</p>
                        ) : null}
                        <div className={styles.teamCardActions}>
                          {managedEntries.some((managed) => managed.entryId === entry.id) ? (
                            <TournamentEntryManager
                              busy={busyEntryId === entry.id}
                              locked={!mayManageEntry}
                              entry={
                                managedEntries.find((managed) => managed.entryId === entry.id)!
                              }
                              onDecision={(requestId, decision) =>
                                void handleRequestDecision(entry.id, requestId, decision)
                              }
                              onJoinModeChange={(joinMode) =>
                                void handleJoinModeChange(entry.id, joinMode)
                              }
                              onWithdraw={() => void handleWithdrawEntry(entry.id)}
                            />
                          ) : (
                            <span className={styles.joinMode}>
                              {entry.joinMode === "OPEN"
                                ? t("dota.tournaments.openJoin")
                                : t("dota.tournaments.requestJoin")}
                            </span>
                          )}
                          <div
                            className={`${styles.entryActions} ${entry.teamPartySlug ? "" : styles.entryActionsSingle}`}
                          >
                            {isCurrentMember &&
                            myProfile &&
                            mayManageEntry &&
                            unassignedMembers.some(
                              (member) => member.dotaProfileSlug === myProfile.slug
                            ) ? (
                              <div className={styles.joinControls}>
                                <label>
                                  <span>{t("dota.tournaments.selectPosition")}</span>
                                  <select
                                    value={selectedRoles[entry.id] ?? ""}
                                    onChange={(event) =>
                                      setSelectedRoles((roles) => ({
                                        ...roles,
                                        [entry.id]: event.target.value
                                      }))
                                    }
                                  >
                                    <option value="">—</option>
                                    {availableRoles(entry.members, myProfile.roles).map((role) => (
                                      <option key={role} value={role}>
                                        {roleLabel(role, t)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <button
                                  className="button-primary"
                                  disabled={busyEntryId !== null || !selectedRoles[entry.id]}
                                  onClick={() =>
                                    void handleAssignPosition(entry.id, selectedRoles[entry.id]!)
                                  }
                                  type="button"
                                >
                                  {t("dota.team.renameSave")}
                                </button>
                              </div>
                            ) : null}
                            {isCurrentMember &&
                            managedEntriesLoaded &&
                            !managedEntries.some((managed) => managed.entryId === entry.id) ? (
                              <button
                                className={`button-secondary ${styles.teamCardPrimaryAction}`}
                                disabled={
                                  busyEntryId !== null ||
                                  ["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(
                                    tournament.status
                                  )
                                }
                                onClick={() => void handleLeave(entry.id)}
                                type="button"
                              >
                                {busyEntryId === entry.id
                                  ? t("common.loadingEllipsis")
                                  : t("dota.tournaments.leaveTournament")}
                              </button>
                            ) : null}
                            {canJoin ? (
                              !authSession?.accessToken ? (
                                <Link
                                  className={`button-primary ${styles.teamCardPrimaryAction}`}
                                  href="/profile"
                                >
                                  {t("dota.tournaments.signInToJoin")}
                                </Link>
                              ) : !profileLoaded ? (
                                <span
                                  className={`${styles.joinMode} ${styles.teamCardPrimaryAction}`}
                                >
                                  {t("common.loadingEllipsis")}
                                </span>
                              ) : !myProfile ? (
                                <Link
                                  className={`button-primary ${styles.teamCardPrimaryAction}`}
                                  href="/dota/create"
                                >
                                  {t("dota.tournaments.createProfileToJoin")}
                                </Link>
                              ) : (
                                <div
                                  className={`${styles.joinControls} ${styles.teamCardPrimaryAction}`}
                                >
                                  <label>
                                    <span>{t("dota.tournaments.selectPosition")}</span>
                                    <select
                                      disabled={!!ownEntry}
                                      onChange={(event) =>
                                        setSelectedRoles((current) => ({
                                          ...current,
                                          [entry.id]: event.target.value
                                        }))
                                      }
                                      value={
                                        selectedRoles[entry.id] ??
                                        availableRoles(entry.members, myProfile.roles)[0] ??
                                        ""
                                      }
                                    >
                                      {availableRoles(entry.members, myProfile.roles).map(
                                        (role) => (
                                          <option key={role} value={role}>
                                            {roleLabel(role, t)}
                                          </option>
                                        )
                                      )}
                                    </select>
                                  </label>
                                  <button
                                    className="button-primary"
                                    disabled={
                                      busyEntryId !== null ||
                                      !!ownEntry ||
                                      availableRoles(entry.members, myProfile.roles).length === 0
                                    }
                                    title={ownEntry ? t("dota.tournaments.room.alreadyMember") : undefined}
                                    onClick={() =>
                                      void handleJoin(
                                        entry.id,
                                        selectedRoles[entry.id] ??
                                          availableRoles(entry.members, myProfile.roles)[0] ??
                                          ""
                                      )
                                    }
                                    type="button"
                                  >
                                    {busyEntryId === entry.id
                                      ? t("common.loadingEllipsis")
                                      : entry.joinMode === "OPEN"
                                        ? t("dota.tournaments.joinTeam")
                                        : t("dota.tournaments.applyToTeam")}
                                  </button>
                                </div>
                              )
                            ) : null}
                            {
                              <Link
                                className={`button-secondary ${styles.teamPageLink} ${canJoin || isCurrentMember ? "" : styles.teamPageOnly}`}
                                href={tournamentRoomUrl(slug, entry.id)}
                              >
                                {t("dota.tournaments.room.open")}
                              </Link>
                            }
                            {mayManageEntry &&
                            entry.members.length < 5 ? (
                              <button
                                className={`button-secondary ${styles.teamPageLink}`}
                                onClick={() => void handleCopyInvite(entry.id)}
                                type="button"
                              >
                                {copiedEntryId === entry.id
                                  ? t("dota.tournaments.inviteCopied")
                                  : t("dota.tournaments.inviteSquad")}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </>
      ) : null}
      {joinError ? <p className={styles.joinError}>{joinError}</p> : null}
      {joinFeedback ? <p className={styles.joinFeedback}>{joinFeedback}</p> : null}
    </section>
  );
}

function availableRoles(
  members: DotaTournament["entries"][number]["members"],
  profileRoles: string[]
): string[] {
  const occupied = new Set(members.map((member) => member.positionRole).filter(Boolean));
  return ["1", "2", "3", "4", "5"].filter(
    (role) => profileRoles.includes(role) && !occupied.has(role)
  );
}

const TOURNAMENT_ROLES = ["1", "2", "3", "4", "5"] as const;

function roleLabel(role: string, t: ReturnType<typeof useTranslation>): string {
  switch (role) {
    case "1":
      return t("dota.position.1");
    case "2":
      return t("dota.position.2");
    case "3":
      return t("dota.position.3");
    case "4":
      return t("dota.position.4");
    case "5":
      return t("dota.position.5");
    default:
      return t("dota.tournaments.freePosition");
  }
}

function TournamentEntryManager({
  busy,
  locked,
  entry,
  onDecision,
  onJoinModeChange,
  onWithdraw
}: {
  busy: boolean;
  locked: boolean;
  entry: DotaTournamentManagedEntry;
  onDecision: (requestId: string, decision: "ACCEPT" | "DECLINE") => void;
  onJoinModeChange: (joinMode: "OPEN" | "CONFIRM") => void;
  onWithdraw: () => void;
}) {
  const t = useTranslation();
  return (
    <section className={styles.entryManager}>
      <div className={styles.entryManagerControls}>
        <label>
          <span>{t("dota.tournaments.teamJoinMode")}</span>
          <select
            disabled={busy || locked}
            onChange={(event) => onJoinModeChange(event.target.value as "OPEN" | "CONFIRM")}
            value={entry.joinMode}
          >
            <option value="CONFIRM">{t("dota.tournaments.requestJoin")}</option>
            <option value="OPEN">{t("dota.tournaments.openJoin")}</option>
          </select>
        </label>
        <button className="button-secondary" disabled={busy || locked} onClick={onWithdraw} type="button">
          {t("dota.tournaments.withdrawSquad")}
        </button>
      </div>
      {entry.requests.length > 0 ? (
        <div className={styles.entryRequests}>
          <h4>{t("dota.tournaments.pendingRequests", { count: String(entry.requests.length) })}</h4>
          {entry.requests.map((request) => (
            <div className={styles.entryRequest} key={request.id}>
              <span>
                {request.displayName} · {roleLabel(request.positionRole, t)} ·{" "}
                {request.mmr ? `${request.mmr} MMR` : "— MMR"}
              </span>
              <div>
                <button
                  className="button-primary"
                  disabled={busy || locked}
                  onClick={() => onDecision(request.id, "ACCEPT")}
                  type="button"
                >
                  {t("dota.tournaments.acceptRequest")}
                </button>
                <button
                  className="button-secondary"
                  disabled={busy || locked}
                  onClick={() => onDecision(request.id, "DECLINE")}
                  type="button"
                >
                  {t("dota.tournaments.declineRequest")}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>{t("dota.tournaments.noPendingRequests")}</p>
      )}
    </section>
  );
}
