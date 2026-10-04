"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { fetchMyDotaProfile } from "../../dota/api/dota-api";
import type { DotaProfile } from "../../dota/types/dota";
import { useTranslation } from "../../i18n/locale-provider";
import { DotaTournamentMatchCard } from "./dota-tournament-match-card";
import {
  fetchDotaTournament,
  joinDotaTournamentEntry,
  leaveDotaTournamentEntry
} from "../api/dota-tournaments-api";
import type { DotaTournament } from "../types/dota-tournament";
import { formatDate, statusLabel } from "./dota-tournaments-view";
import styles from "./dota-tournaments-view.module.css";

export function DotaTournamentDetailView({ slug }: { slug: string }) {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const [tournament, setTournament] = useState<DotaTournament | null>(null);
  const matches = tournament?.matches ?? [];
  const [myProfile, setMyProfile] = useState<DotaProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinFeedback, setJoinFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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

  return (
    <section className={styles.page}>
      <Link className={styles.back} href="/games/tournaments">
        ← {t("dota.tournaments.backToTournaments")}
      </Link>
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
          {tournament.rulesUrl ? (
            <a
              className="button-secondary"
              href={tournament.rulesUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("dota.tournaments.rules")}
            </a>
          ) : null}
        </div>
        {tournament.status === "REGISTRATION_OPEN" ? (
          <Link
            className={`button-primary ${styles.teamSignupPrimary}`}
            href="#registered-teams"
          >
            {t("dota.tournaments.joinOrCreateTeam")}
          </Link>
        ) : null}
      </header>

      <div className={styles.teamHeading} id="registered-teams">
        <div>
          <h2>{t("dota.tournaments.registeredTeams")}</h2>
          <p>{t("dota.tournaments.teamsLead")}</p>
        </div>
        {tournament.status === "REGISTRATION_OPEN" ? (
          <Link
            className="button-secondary"
            href={`/dota/teams/create?tournament=${encodeURIComponent(tournament.slug)}`}
          >
            {t("dota.tournaments.createTeam")}
          </Link>
        ) : null}
      </div>
      {tournament.entries.length === 0 ? (
        <div className={styles.emptyState}>
          <span aria-hidden="true">♟</span>
          <h2>{t("dota.tournaments.noTeamsTitle")}</h2>
          <p>{t("dota.tournaments.noTeamsLead")}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {tournament.entries.map((entry) => {
            const isCurrentMember = entry.members.some(
              (member) => member.dotaProfileSlug && member.dotaProfileSlug === myProfile?.slug
            );
            const canJoin =
              tournament.status === "REGISTRATION_OPEN" &&
              entry.members.length < 5 &&
              !isCurrentMember;

            return (
              <article className={styles.teamCard} key={entry.id}>
                <div className={styles.teamCardTop}>
                  <h3>{entry.teamName}</h3>
                  <span>
                    {t("dota.tournaments.rosterCount", {
                      current: String(entry.members.length),
                      max: "5"
                    })}
                  </span>
                </div>
                <ul className={styles.memberList}>
                  {entry.members.map((member, index) => (
                    <li
                      key={member.dotaProfileSlug ?? `${entry.id}-${member.displayName}-${index}`}
                    >
                      <span className={styles.position}>{member.positionRole ?? "—"}</span>
                      <span className={styles.playerName}>
                        {member.dotaProfileSlug ? (
                          <Link href={`/dota/${encodeURIComponent(member.dotaProfileSlug)}`}>
                            {member.displayName}
                          </Link>
                        ) : (
                          member.displayName
                        )}
                      </span>
                      <span className={styles.mmr}>
                        {member.mmr ? `${member.mmr} MMR` : "— MMR"}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className={styles.teamCardActions}>
                  <span className={styles.joinMode}>
                    {entry.joinMode === "OPEN"
                      ? t("dota.tournaments.openJoin")
                      : t("dota.tournaments.requestJoin")}
                  </span>
                  <div
                    className={`${styles.entryActions} ${entry.teamPartySlug ? "" : styles.entryActionsSingle}`}
                  >
                    {isCurrentMember ? (
                      <button
                        className={`button-secondary ${styles.teamCardPrimaryAction}`}
                        disabled={
                          busyEntryId !== null ||
                          ["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(tournament.status)
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
                        <span className={`${styles.joinMode} ${styles.teamCardPrimaryAction}`}>
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
                        <div className={`${styles.joinControls} ${styles.teamCardPrimaryAction}`}>
                          <label>
                            <span>{t("dota.tournaments.selectPosition")}</span>
                            <select
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
                              {availableRoles(entry.members, myProfile.roles).map((role) => (
                                <option key={role} value={role}>
                                  {t("dota.tournaments.position", { role })}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="button-primary"
                            disabled={
                              busyEntryId !== null ||
                              availableRoles(entry.members, myProfile.roles).length === 0
                            }
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
                    {entry.teamPartySlug ? (
                      <Link
                        className={`button-secondary ${styles.teamPageLink} ${canJoin || isCurrentMember ? "" : styles.teamPageOnly}`}
                        href={`/dota/teams/${encodeURIComponent(entry.teamPartySlug)}`}
                      >
                        {t("dota.tournaments.openTeam")}
                      </Link>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <div className={styles.teamHeading}>
        <div>
          <h2>{t("dota.tournaments.matchesTitle")}</h2>
          <p>{t("dota.tournaments.matchSectionLead")}</p>
        </div>
      </div>
      {matches.length === 0 ? (
        <div className={styles.emptyState}>
          <span aria-hidden="true">⚔</span>
          <p>{t("dota.tournaments.matchNoMatches")}</p>
        </div>
      ) : (
        <div className={styles.matchGrid}>
          {matches.map((match) => (
            <DotaTournamentMatchCard key={match.id} match={match} tournamentSlug={tournament.slug} />
          ))}
        </div>
      )}
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
