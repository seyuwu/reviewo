"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useTranslation } from "../../i18n/locale-provider";
import type { DotaTournament } from "../types/dota-tournament";
import { tournamentRoomUrl } from "../api/tournament-rooms-api";
import styles from "./dota-tournament-bracket.module.css";
import { TournamentMatchSettings } from "./tournament-match-settings";
import { formatDate } from "./dota-tournaments-view";

export function DotaTournamentBracket({ tournament, editor }: { tournament: DotaTournament;
  editor?: { token: string; onSaved: () => Promise<void> } }) {
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
            sourceAResult: null, sourceBResult: null,
            bestOf: match.bestOf ?? 1, scheduledAt: match.scheduledAt, score: match.score ?? null,
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
  const double = tournament.bracketFormat === "DOUBLE_ELIMINATION";
  const lowerRounds = [...new Set(bracket.nodes.filter((node) => node.kind === "LOWER").map((node) => node.roundNumber))].sort((a, b) => a - b);
  const doubleStageCount = Math.max(roundNumbers.length, lowerRounds.length, 1);
  const doubleBracketMinWidth = 70 + doubleStageCount * 108 + 136 + (doubleStageCount + 1) * 10;
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
      ? t(double ? "dota.tournaments.bracket.upperFinal" : "dota.tournaments.bracket.final")
      : round === rounds - 1
        ? t("dota.tournaments.bracket.semifinal")
        : t("dota.tournaments.bracket.round", { number: String(round) });
  }
  function nodeCard(node: NonNullable<DotaTournament["bracket"]>["nodes"][number]) {
    const sourceLabel = (source: string | null, result?: "WINNER" | "LOSER" | null) => {
      if (!source) return t("dota.tournaments.bracket.empty");
      const sourceNode = bracket!.nodes.find((item) => item.key === source);
      const matchLabel = sourceNode?.kind === "GRAND_FINAL" ? t("dota.tournaments.bracket.grandFinal")
        : (double ? sourceNode?.kind === "LOWER" ? "L" : "U" : "") + `${sourceNode?.roundNumber}.${sourceNode?.matchNumber}`;
      return t(
        result === "LOSER" || node.kind === "BRONZE"
          ? "dota.tournaments.bracket.loserOf"
          : "dota.tournaments.bracket.winnerOf",
        { match: matchLabel }
      );
    };
    const content = (
      <>
        <div className={styles.matchHeading}>
          <span>
            {node.kind === "GRAND_FINAL" ? t("dota.tournaments.bracket.grandFinal")
              : node.kind === "BRONZE"
              ? t("dota.tournaments.bracket.bronze")
              : (double ? node.kind === "LOWER" ? "L" : "U" : "") + `${node.roundNumber}.${node.matchNumber}`}
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
          const entry = id ? entryMap.get(id) : null;
          return (
            <div
              className={`${styles.team} ${id && node.winnerEntryId === id ? styles.winner : ""}`}
              key={side}
            >
              <span className={styles.seed}>{seed ? `#${seed.seed}` : "—"}</span>
              <div>
                <strong>
                  {id
                    ? entry
                      ? <Link className={styles.teamLink} href={tournamentRoomUrl(tournament.slug, id)}>{entry.teamName}</Link>
                      : "—"
                    : sourceLabel(side === 0 ? node.sourceA : node.sourceB, side === 0 ? node.sourceAResult : node.sourceBResult)}
                </strong>
                {node.kind === "GRAND_FINAL" && side === 0 ? (
                  <small className={styles.sideChoice}>{t("dota.tournaments.bracket.upperSideChoice")}</small>
                ) : null}
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
        <small className={styles.matchMeta}>BO{node.bestOf ?? 1}{node.score && (node.bestOf ?? 1) > 1 ? " · " + node.score.A + ":" + node.score.B : ""}
          {" · "}{node.scheduledAt ? formatDate(node.scheduledAt) : t("dota.tournaments.bracket.autoTime")}</small>
        {node.matchId ? (
          <span className={styles.matchLink}>{t("dota.tournaments.bracket.openMatch")} →</span>
        ) : null}
      </>
    );
    const className = `${styles.match} ${node.matchId ? styles.linked : ""} ${node.status === "COMPLETED" ? styles.completed : ""}`;
    const card = (
      <div className={className}>
        {node.matchId ? (
          <Link
            aria-label={`${t("dota.tournaments.bracket.openMatch")}: ${tournament.title}`}
            className={styles.matchOverlay}
            href={`/games/tournaments/${encodeURIComponent(tournament.slug)}/matches/${encodeURIComponent(node.matchId)}`}
          />
        ) : null}
        {content}
      </div>
    );
    return <>{card}{editor && node.roundOffset !== undefined ? <TournamentMatchSettings
      slug={tournament.slug} position={{ bracketKind: node.kind, roundOffset: node.roundOffset, matchNumber: node.matchNumber }}
      token={editor.token} bestOf={node.bestOf ?? 1} scheduledAt={node.scheduledAt ?? null}
      canEditBestOf={node.canEditBestOf ?? false} canEditTime={node.canEditTime ?? false} onSaved={editor.onSaved}
    /> : null}</>;
  }
  return (
    <section className={styles.section} id="tournament-bracket">
      <div className={styles.title}>
        <div>
          <p>{tournament.bracket ? "FDP · " + (double ? "DOUBLE ELIMINATION" : "SINGLE ELIMINATION") : tournament.format}</p>
          <h2>{t("dota.tournaments.bracket.title")}</h2>
        </div>
      </div>
      {tournament.planning ? <p className={styles.lead}>{t("dota.tournaments.bracket.planHint")}</p> : null}
      {double ? (
        <div
          className={styles.doubleScroll}
          tabIndex={0}
          role="region"
          aria-label={t("dota.tournaments.bracket.title")}
        >
          <div
            className={styles.doubleBoard}
            style={{
              "--stage-count": doubleStageCount,
              minWidth: `${doubleBracketMinWidth}px`
            } as CSSProperties}
          >
            <div className={styles.laneLabel} style={{ gridColumn: 1, gridRow: 1 }}>
              {t("dota.tournaments.bracket.upper")}
            </div>
            {roundNumbers.map((round, index) => (
              <div className={styles.doubleStage} key={`upper-${round}`} style={{ gridColumn: index + 2, gridRow: 1 }}>
                <h3>{roundLabel(round)}</h3>
                <div className={styles.doubleStageNodes}>
                  {bracket.nodes
                    .filter((node) => node.kind === "MAIN" && node.roundNumber === round)
                    .map((node) => (
                      <div
                        className={`${styles.doubleNode} ${round < rounds ? styles.connected : ""}`}
                        key={node.key}
                      >
                        {round > 1 ? <span aria-hidden="true" className={styles.incoming} /> : null}
                        {nodeCard(node)}
                      </div>
                    ))}
                </div>
              </div>
            ))}
            <div className={styles.laneLabel} style={{ gridColumn: 1, gridRow: 2 }}>
              {t("dota.tournaments.bracket.lower")}
            </div>
            {lowerRounds.map((round, index) => (
              <div className={styles.doubleStage} key={`lower-${round}`} style={{ gridColumn: index + 2, gridRow: 2 }}>
                <h3>{t("dota.tournaments.bracket.round", { number: String(round) })}</h3>
                <div className={styles.doubleStageNodes}>
                  {bracket.nodes
                    .filter((node) => node.kind === "LOWER" && node.roundNumber === round)
                    .map((node) => (
                      <div className={`${styles.doubleNode} ${index < lowerRounds.length - 1 ? styles.connected : ""}`} key={node.key}>
                        {round > 1 ? <span aria-hidden="true" className={styles.incoming} /> : null}
                        {nodeCard(node)}
                      </div>
                    ))}
                </div>
              </div>
            ))}
            {bracket.nodes.filter((node) => node.kind === "GRAND_FINAL").map((node) => (
              <div
                className={styles.doubleFinal}
                key={node.key}
                style={{ gridColumn: doubleStageCount + 2, gridRow: "1 / span 2" }}
              >
                <h3>{t("dota.tournaments.bracket.grandFinal")}</h3>
                {nodeCard(node)}
              </div>
            ))}
          </div>
        </div>
      ) : (
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
      )}
      {!double && lowerRounds.length ? <>
        <h3 className={styles.laneTitle}>{t("dota.tournaments.bracket.lower")}</h3>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label={t("dota.tournaments.bracket.lower")}>
          <div className={styles.grid} style={{ "--rounds": lowerRounds.length } as CSSProperties}>
            {lowerRounds.map((round) => <div className={styles.column} key={round}>
              <h3>{t("dota.tournaments.bracket.round", { number: String(round) })}</h3>
              <div className={styles.roundNodes}>{bracket.nodes.filter((node) => node.kind === "LOWER" && node.roundNumber === round)
                .map((node) => <div className={styles.node} key={node.key}>{nodeCard(node)}</div>)}</div>
            </div>)}
          </div>
        </div>
      </> : null}
      {!double ? <div className={styles.finalMatches}>{bracket.nodes.filter((node) => node.kind === "GRAND_FINAL").map((node) =>
        <div key={node.key}><h3 className={styles.laneTitle}>{t("dota.tournaments.bracket.grandFinal")}</h3>{nodeCard(node)}</div>)}</div> : null}
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
