"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import {
  fetchDotaTournamentMatch,
  fetchPublicDotaTournamentMatch
} from "../api/dota-tournaments-api";
import type { DotaTournamentMatch, PublicDotaTournamentMatch } from "../types/dota-tournament";
import { DotaTournamentMatchCard } from "./dota-tournament-match-card";
import styles from "./dota-tournament-match-page.module.css";

export function DotaTournamentMatchPage({ slug, matchId }: { slug: string; matchId: string }) {
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [match, setMatch] = useState<PublicDotaTournamentMatch | null>(null);
  const [participant, setParticipant] = useState<DotaTournamentMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [participantLoading, setParticipantLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const refreshInFlight = useRef(false);
  const requestRevision = useRef(0);
  const actionInFlight = useRef(false);

  useEffect(() => {
    requestRevision.current += 1;
    let active = true;
    setParticipant(null);
    setParticipantLoading(false);
    if (!isAuthSessionLoaded)
      return () => {
        active = false;
      };
    setLoading(true);
    setMatch(null);
    setError(false);
    void fetchPublicDotaTournamentMatch(slug, matchId, authSession?.accessToken)
      .then(async (item) => {
        if (!active) return;
        setMatch(item);
        setLoading(false);
        if (item.isParticipant && authSession?.accessToken) {
          setParticipantLoading(true);
          const details = await fetchDotaTournamentMatch(
            slug,
            matchId,
            authSession.accessToken
          ).catch(() => null);
          if (active) setParticipant(details);
        }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setParticipantLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [slug, matchId, authSession?.accessToken, isAuthSessionLoaded]);

  const refresh = useCallback(
    async (silent = false) => {
      if (refreshInFlight.current || (silent && actionInFlight.current)) return;
      refreshInFlight.current = true;
      const revision = requestRevision.current;
      if (!silent) {
        setRefreshing(true);
        setError(false);
      }
      try {
        const item = await fetchPublicDotaTournamentMatch(slug, matchId, authSession?.accessToken);
        let details: DotaTournamentMatch | null = null;
        if (item.isParticipant && authSession?.accessToken) {
          details = await fetchDotaTournamentMatch(slug, matchId, authSession.accessToken).catch(
            () => null
          );
        }
        if (revision !== requestRevision.current) return;
        setMatch(item);
        setParticipant(details);
      } catch {
        if (!silent && revision === requestRevision.current) setError(true);
      } finally {
        refreshInFlight.current = false;
        if (!silent) setRefreshing(false);
      }
    },
    [slug, matchId, authSession?.accessToken]
  );

  const handleBusyChange = useCallback((busy: boolean) => {
    actionInFlight.current = busy;
    if (busy) requestRevision.current += 1;
  }, []);

  const currentStatus = participant?.status ?? match?.status;
  useEffect(() => {
    if (
      !currentStatus ||
      !["LOBBY_CONFIRMATION", "SPECTATOR_ADMISSION", "READY"].includes(currentStatus)
    )
      return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [currentStatus, refresh]);

  const backHref = `/games/tournaments/${encodeURIComponent(match?.tournament.slug ?? safeSlug(slug))}#tournament-bracket`;
  if (loading) return <p className={styles.page}>{t("common.loadingEllipsis")}</p>;
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link href={backHref}>
          ← {match?.tournament.title ?? t("dota.tournaments.bracket.title")}
        </Link>
        <div className={styles.heading}>
          <h1>
            {match?.bracketKind === "BRONZE"
              ? t("dota.tournaments.bracket.bronze")
              : match
                ? t("dota.tournaments.matchLabel", {
                    round: String(match.roundNumber),
                    number: String(match.matchNumber)
                  })
                : t("dota.tournaments.matchesTitle")}
          </h1>
          <button
            className="button-secondary"
            disabled={refreshing}
            type="button"
            onClick={() => void refresh()}
          >
            {refreshing ? t("common.loadingEllipsis") : t("dota.tournaments.refreshMatch")}
          </button>
        </div>
      </header>
      {error ? (
        <p className={styles.error} role="alert">
          {t("dota.tournaments.matchPageLoadError")}
        </p>
      ) : null}
      {match ? (
        <>
          <div className={styles.scoreboard}>
            <DotaTournamentMatchCard
              key={match.id}
              match={match}
              tournamentSlug={match.tournament.slug}
              initialDetails={participant}
              participantLoading={participantLoading}
              onChanged={refresh}
              onBusyChange={handleBusyChange}
            />
          </div>
          <div className={styles.rosters}>
            {(["A", "B"] as const).map((side) => (
              <section
                className={`${styles.roster} ${match.winnerEntryId === (side === "A" ? match.entryA.id : match.entryB.id) ? styles.winningRoster : ""}`}
                key={side}
              >
                <p>
                  {side === match.hostSide
                    ? t("dota.tournaments.matchLobbyHost")
                    : t("dota.tournaments.matchOpponent")}
                </p>
                <h2>{side === "A" ? match.entryA.teamName : match.entryB.teamName}</h2>
                <ul>
                  {match.rosters[side].map((member, index) => (
                    <li key={`${member.dotaProfileSlug ?? index}`}>
                      <span
                        className={styles.role}
                        title={
                          member.positionRole
                            ? t(`dota.position.${member.positionRole}` as never)
                            : undefined
                        }
                      >
                        {member.positionRole ?? "—"}
                      </span>
                      {member.dotaProfileSlug ? (
                        <Link href={`/dota/${encodeURIComponent(member.dotaProfileSlug)}`}>
                          {member.displayName}
                        </Link>
                      ) : (
                        <strong>{member.displayName}</strong>
                      )}
                      <small>{member.mmr !== null ? `${member.mmr} MMR` : "—"}</small>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function safeSlug(slug: string) {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}
