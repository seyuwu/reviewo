"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getGamesTournamentUrl,
  getGamesTournamentsUrl
} from "../../../lib/config/product-hosts";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchDotaTournaments } from "../api/dota-tournaments-api";
import type { DotaTournamentSummary } from "../types/dota-tournament";
import { formatDate, statusLabel } from "./dota-tournaments-view";
import styles from "../../games/components/games-search-view.module.css";

const MAX_VISIBLE_TOURNAMENTS = 2;

export function DotaUpcomingTournamentsPanel() {
  const t = useTranslation();
  const [tournaments, setTournaments] = useState<DotaTournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchDotaTournaments()
      .then((items) => {
        if (active) setTournaments(items);
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
  }, []);

  const upcoming = tournaments
    .filter(isUpcomingTournament)
    .sort((left, right) => {
      const leftClosed = Number(left.status !== "REGISTRATION_OPEN");
      const rightClosed = Number(right.status !== "REGISTRATION_OPEN");
      const statusOrder = leftClosed - rightClosed;
      if (statusOrder !== 0) return statusOrder;
      return (left.startsAt ? Date.parse(left.startsAt) : Number.MAX_SAFE_INTEGER) -
        (right.startsAt ? Date.parse(right.startsAt) : Number.MAX_SAFE_INTEGER);
    })
    .slice(0, MAX_VISIBLE_TOURNAMENTS);

  return (
    <section aria-labelledby="upcoming-tournaments-title" className={styles.tournamentShowcase}>
      <header className={styles.tournamentShowcaseHeader}>
        <div className={styles.tournamentShowcaseHeading}>
          <span aria-hidden="true" className={styles.tournamentShowcaseIcon}>🏆</span>
          <div>
            <p className={styles.tournamentShowcaseEyebrow}>{t("dota.tournaments.eyebrow")}</p>
            <h2 id="upcoming-tournaments-title">{t("games.tournaments.upcomingTitle")}</h2>
            <p>{t("games.tournaments.upcomingLead")}</p>
          </div>
        </div>
        <Link className={styles.tournamentAllLink} href={getGamesTournamentsUrl()}>
          {t("games.tournaments.allLink")}
          <span aria-hidden="true">→</span>
        </Link>
      </header>

      {loading ? (
        <div aria-label={t("common.loadingEllipsis")} className={styles.tournamentCards}>
          <div className={styles.tournamentSkeleton} />
          <div className={styles.tournamentSkeleton} />
        </div>
      ) : null}

      {!loading && failed ? (
        <p className={styles.tournamentEmpty} role="status">
          {t("games.tournaments.loadError")}
        </p>
      ) : null}

      {!loading && !failed && upcoming.length === 0 ? (
        <div className={styles.tournamentEmpty}>
          <strong>{t("games.tournaments.noneTitle")}</strong>
          <span>{t("games.tournaments.noneLead")}</span>
        </div>
      ) : null}

      {!loading && !failed && upcoming.length > 0 ? (
        <div className={styles.tournamentCards}>
          {upcoming.map((tournament) => {
            const registrationOpen = tournament.status === "REGISTRATION_OPEN";

            return (
              <article className={styles.tournamentCard} key={tournament.id}>
                <div className={styles.tournamentCardTop}>
                  <span className={styles.tournamentStatus}>
                    {statusLabel(tournament.status, t)}
                  </span>
                  <span className={styles.tournamentTeamCount}>
                    {t("dota.tournaments.teamCount", {
                      count: String(tournament.registeredTeams),
                      max: tournament.maxTeams ? String(tournament.maxTeams) : "∞"
                    })}
                  </span>
                </div>
                <h3>{tournament.title}</h3>
                <div className={styles.tournamentCardMeta}>
                  {tournament.startsAt ? (
                    <span>{t("dota.tournaments.startsAt", { date: formatDate(tournament.startsAt) })}</span>
                  ) : null}
                  {tournament.format ? <span>{tournament.format}</span> : null}
                </div>
                <Link
                  className={`button-primary ${styles.tournamentAction}`}
                  href={getGamesTournamentUrl(tournament.slug)}
                >
                  {registrationOpen
                    ? t("games.tournaments.joinOrCreate")
                    : t("games.tournaments.viewTeams")}
                </Link>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function isUpcomingTournament(tournament: DotaTournamentSummary): boolean {
  if (tournament.status === "REGISTRATION_OPEN") return true;
  if (tournament.status !== "REGISTRATION_CLOSED") return false;
  return !tournament.startsAt || Date.parse(tournament.startsAt) >= Date.now();
}
