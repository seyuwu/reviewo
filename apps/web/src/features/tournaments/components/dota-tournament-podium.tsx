"use client";

import { useTranslation } from "../../i18n/locale-provider";
import type { DotaTournamentSummary } from "../types/dota-tournament";
import styles from "./dota-tournament-bracket.module.css";

export function DotaTournamentPodium({
  tournament,
  compact = false
}: {
  tournament: DotaTournamentSummary;
  compact?: boolean;
}) {
  const t = useTranslation();
  return (
    <section
      aria-label={t("dota.tournaments.bracket.results")}
      className={`${styles.podium} ${compact ? styles.compact : ""}`}
    >
      {[1, 2, 3].map((place) => {
        const result = tournament.podium?.find((item) => item.place === place);
        return (
          <article className={`${styles.place} ${styles[`place${place}`]}`} key={place}>
            <div className={styles.medal} aria-hidden="true">
              {["🥇", "🥈", "🥉"][place - 1]}
            </div>
            <p>{t("dota.tournaments.bracket.place", { number: String(place) })}</p>
            <h3>{result?.teamName ?? t("dota.tournaments.bracket.noPlace")}</h3>
            <ul>
              {result?.members.map((member, index) => (
                <li key={`${member.dotaProfileSlug ?? index}`}>
                  <span className={styles.role}>{member.positionRole ?? "—"}</span>
                  <span>{member.displayName}</span>
                  {!compact ? (
                    <small>{member.mmr !== null ? `${member.mmr} MMR` : "—"}</small>
                  ) : null}
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </section>
  );
}
