"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { getCurrentUserProfile } from "../../profile/api/profile";
import { fetchDotaTournaments } from "../api/dota-tournaments-api";
import type { DotaTournamentSummary } from "../types/dota-tournament";
import { DotaTournamentPodium } from "./dota-tournament-podium";
import { TournamentTelegramButton } from "./tournament-telegram-onboarding";
import styles from "./dota-tournaments-view.module.css";
import { TournamentCardsSkeleton } from "./tournament-page-skeleton";

let cachedDirectory: { userId: string; items: DotaTournamentSummary[]; fetchedAt: number } | null = null;
const DIRECTORY_CACHE_TTL_MS = 5 * 60 * 1000;

export function DotaTournamentsView() {
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const [tournaments, setTournaments] = useState<DotaTournamentSummary[]>([]);
  const [canManageTournaments, setCanManageTournaments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    if (cachedDirectory && cachedDirectory.userId === authSession?.userId && Date.now() - cachedDirectory.fetchedAt < DIRECTORY_CACHE_TTL_MS) {
      setTournaments(cachedDirectory.items);
      setLoading(false);
    }
  }, [authSession?.userId]);

  useEffect(() => {
    if (!isAuthSessionLoaded) return;
    if (!authSession?.accessToken) {
      setTournaments([]);
      setLoading(false);
      return;
    }

    let active = true;
    void fetchDotaTournaments(authSession.accessToken)
      .then((items) => {
        if (active) {
          cachedDirectory = { userId: authSession.userId, items, fetchedAt: Date.now() };
          setTournaments(items);
        }
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
  }, [authSession?.accessToken, isAuthSessionLoaded]);

  useEffect(() => {
    if (!isAuthSessionLoaded || !authSession?.accessToken) {
      setCanManageTournaments(false);
      return;
    }

    let active = true;
    void getCurrentUserProfile(authSession.accessToken)
      .then((profile) => {
        if (active) {
          setCanManageTournaments(
            profile.role === "ADMIN" || profile.role === "TOURNAMENT_MODERATOR"
          );
        }
      })
      .catch(() => {
        if (active) setCanManageTournaments(false);
      });

    return () => {
      active = false;
    };
  }, [authSession?.accessToken, isAuthSessionLoaded]);

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{t("dota.tournaments.eyebrow")}</p>
          <h1>{t("dota.tournaments.title")}</h1>
          <p>{t("dota.tournaments.lead")}</p>
        </div>
        <div className={styles.heroActions}>
          {canManageTournaments ? (
            <Link className="button-secondary" href="/games/tournaments/manage">
              {t("dota.tournaments.admin.create")}
            </Link>
          ) : null}
          <TournamentTelegramButton />
        </div>
      </header>

      {loading ? (
        <span className={styles.visuallyHidden} role="status">
          {t("common.loadingEllipsis")}
        </span>
      ) : null}
      <div aria-busy={loading} className={`${styles.grid} ${styles.directoryGrid}`}>
        {loading ? <TournamentCardsSkeleton /> : null}
        {!loading && failed ? <p className={styles.empty}>{t("dota.tournaments.loadError")}</p> : null}
        {!loading && !failed && tournaments.length === 0 ? (
          <div className={styles.emptyState}>
            <span aria-hidden="true">🏆</span>
            <h2>{t("dota.tournaments.emptyTitle")}</h2>
            <p>{t("dota.tournaments.emptyLead")}</p>
          </div>
        ) : null}
        {!loading && !failed
          ? tournaments.map((tournament) => (
              <Link
                className={styles.card}
                href={`/games/tournaments/${encodeURIComponent(tournament.slug)}${tournament.status === "COMPLETED" ? "#tournament-bracket" : ""}`}
                key={tournament.id}
              >
                <div className={styles.cardTop}>
                  <span className={styles.status}>{statusLabel(tournament.status, t)}</span>
                  <span className={styles.teamsCount}>
                    {t("dota.tournaments.teamCount", {
                      count: String(tournament.registeredTeams),
                      max: tournament.maxTeams ? String(tournament.maxTeams) : "∞"
                    })}
                  </span>
                </div>
                <h2>{tournament.title}</h2>
                {tournament.status === "COMPLETED" ? (
                  <DotaTournamentPodium tournament={tournament} compact />
                ) : (
                  <>
                    <p className={styles.description}>
                      {tournament.description || t("dota.tournaments.noDescription")}
                    </p>
                    <div className={styles.meta}>
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
                    </div>
                  </>
                )}
                <strong className={styles.cardCta}>
                  {t(
                    tournament.status === "COMPLETED"
                      ? "dota.tournaments.bracket.show"
                      : "dota.tournaments.openTournament"
                  )}
                </strong>
              </Link>
            ))
          : null}
      </div>
    </section>
  );
}

export function statusLabel(
  status: DotaTournamentSummary["status"],
  t: ReturnType<typeof useTranslation>
): string {
  return t(`dota.tournaments.status.${status}` as never);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}
