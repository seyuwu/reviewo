"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useTranslation } from "../../i18n/locale-provider";
import type { DotaTournament } from "../types/dota-tournament";
import styles from "./dota-tournament-bracket.module.css";

export function DotaTournamentBracket({ tournament }: { tournament: DotaTournament }) {
  const t = useTranslation();
  const manualMatches = tournament.matches ?? [];
  const bracket =
    tournament.bracket ??
    (manualMatches.length
      ? {
          size: 0,
          seeds: [],
          nodes: manualMatches.map((match) => ({
            key: match.id,
            kind: match.bracketKind === "BRONZE" ? ("BRONZE" as const) : ("MAIN" as const),
            roundNumber: match.roundNumber,
            matchNumber: match.matchNumber,
            entryAId: match.entryA.id,
            entryBId: match.entryB.id,
            sourceA: null,
            sourceB: null,
            matchId: match.id,
            status: match.status,
            winnerEntryId: match.winnerEntryId
          }))
        }
      : null);
  if (!bracket) return null;
  const roundNumbers = tournament.bracket
    ? Array.from({ length: Math.log2(bracket.size) }, (_, index) => index + 1)
    : [
        ...new Set(
          bracket.nodes.filter((node) => node.kind === "MAIN").map((node) => node.roundNumber)
        )
      ].sort((a, b) => a - b);
  const rounds = Math.max(...roundNumbers);
  const entryMap = new Map(tournament.entries.map((entry) => [entry.id, entry]));
  for (const match of manualMatches) {
    for (const entry of [match.entryA, match.entryB]) {
      if (!entryMap.has(entry.id))
        entryMap.set(entry.id, {
          ...entry,
          members: [],
          status: "REGISTERED",
          joinMode: "OPEN",
          teamPartySlug: null
        });
    }
  }
  const seedMap = new Map(bracket.seeds.map((seed) => [seed.entryId, seed]));
  function roundLabel(round: number) {
    return round === rounds
      ? t("dota.tournaments.bracket.final")
      : round === rounds - 1
        ? t("dota.tournaments.bracket.semifinal")
        : t("dota.tournaments.bracket.round", { number: String(round) });
  }
  function nodeCard(node: NonNullable<DotaTournament["bracket"]>["nodes"][number]) {
    const sourceLabel = (source: string | null) => {
      if (!source) return t("dota.tournaments.bracket.empty");
      const sourceNode = bracket!.nodes.find((item) => item.key === source);
      const matchLabel = `${sourceNode?.roundNumber}.${sourceNode?.matchNumber}`;
      return t(
        node.kind === "BRONZE"
          ? "dota.tournaments.bracket.loserOf"
          : "dota.tournaments.bracket.winnerOf",
        { match: matchLabel }
      );
    };
    const content = (
      <>
        <div className={styles.matchHeading}>
          <span>
            {node.kind === "BRONZE"
              ? t("dota.tournaments.bracket.bronze")
              : `${node.roundNumber}.${node.matchNumber}`}
          </span>
          <span>
            {node.status === "BYE"
              ? t("dota.tournaments.bracket.bye")
              : node.status === "WAITING"
                ? t("dota.tournaments.bracket.waiting")
                : t(`dota.tournaments.matchStatus.${node.status}` as never)}
          </span>
        </div>
        {[node.entryAId, node.entryBId].map((id, side) => {
          const seed = id ? seedMap.get(id) : null;
          return (
            <div
              className={`${styles.team} ${id && node.winnerEntryId === id ? styles.winner : ""}`}
              key={side}
            >
              <span className={styles.seed}>{seed ? `#${seed.seed}` : "—"}</span>
              <div>
                <strong>
                  {id
                    ? (entryMap.get(id)?.teamName ?? "—")
                    : sourceLabel(side === 0 ? node.sourceA : node.sourceB)}
                </strong>
                {seed ? (
                  <small>
                    {seed.averageMmr !== null
                      ? `${Math.round(seed.averageMmr)} MMR`
                      : t("dota.tournaments.bracket.unknownMmr")}
                  </small>
                ) : null}
              </div>
              {id && node.winnerEntryId === id ? (
                <span
                  aria-label={t("dota.tournaments.matchWinner", {
                    team: entryMap.get(id)?.teamName ?? ""
                  })}
                >
                  ✓
                </span>
              ) : null}
            </div>
          );
        })}
        {node.matchId ? (
          <span className={styles.matchLink}>{t("dota.tournaments.bracket.openMatch")} →</span>
        ) : null}
      </>
    );
    const className = `${styles.match} ${node.status === "COMPLETED" ? styles.completed : ""}`;
    return node.matchId ? (
      <Link
        className={className}
        href={`/games/tournaments/${encodeURIComponent(tournament.slug)}/matches/${encodeURIComponent(node.matchId)}`}
      >
        {content}
      </Link>
    ) : (
      <div className={className}>{content}</div>
    );
  }
  return (
    <section className={styles.section} id="tournament-bracket">
      <div className={styles.title}>
        <div>
          <p>{tournament.bracket ? "FDP · SINGLE ELIMINATION" : tournament.format}</p>
          <h2>{t("dota.tournaments.bracket.title")}</h2>
        </div>
        {tournament.bracket ? <span>{t("dota.tournaments.bracket.seeded")}</span> : null}
      </div>
      {tournament.bracket ? (
        <p className={styles.lead}>{t("dota.tournaments.bracket.lead")}</p>
      ) : null}
      <div
        className={styles.scroll}
        tabIndex={0}
        role="region"
        aria-label={t("dota.tournaments.bracket.title")}
      >
        <div className={styles.grid} style={{ "--rounds": roundNumbers.length } as CSSProperties}>
          {roundNumbers.map((round) => (
            <div className={styles.column} key={round}>
              <h3>{roundLabel(round)}</h3>
              <div className={styles.roundNodes}>
                {bracket.nodes
                  .filter((node) => node.kind === "MAIN" && node.roundNumber === round)
                  .map((node) => (
                    <div
                      className={`${styles.node} ${tournament.bracket && round < rounds ? styles.connected : ""}`}
                      key={node.key}
                    >
                      {tournament.bracket && round > 1 ? (
                        <span aria-hidden="true" className={styles.incoming} />
                      ) : null}
                      {nodeCard(node)}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {bracket.nodes
        .filter((node) => node.kind === "BRONZE")
        .map((node) => (
          <div className={styles.bronze} key={node.key}>
            <h3>{t("dota.tournaments.bracket.bronze")}</h3>
            {nodeCard(node)}
          </div>
        ))}
    </section>
  );
}
