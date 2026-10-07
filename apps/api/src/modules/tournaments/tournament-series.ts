import type { Prisma } from "#prisma/client";
import { ConflictException } from "@nestjs/common";

export interface SeriesGame {
  gameNumber: number;
  winnerEntryId: string | null;
  dotaMatchId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}
export function seriesScore(entryAId: string, entryBId: string, games: SeriesGame[]) {
  return {
    A: games.filter((game) => game.winnerEntryId === entryAId).length,
    B: games.filter((game) => game.winnerEntryId === entryBId).length
  };
}
export function currentGameNumber(games: SeriesGame[], status: string) {
  const completed = games.filter((game) => !!game.winnerEntryId).length;
  return status === "COMPLETED" ? Math.max(1, ...games.map((game) => game.gameNumber)) : completed + 1;
}
export function nextGameState(now: Date): Prisma.DotaTournamentMatchUpdateManyMutationInput {
  return {
    status: "SCHEDULED", scheduledAt: now, lobbyDeadlineAt: new Date(now.getTime() + 15 * 60_000),
    confirmationDeadlineAt: null, resultDeadlineAt: null, startedAt: null, winnerEntryId: null,
    lobbyName: null, lobbyPassword: null, lobbyProofUrl: null, lobbySubmittedAt: null, lobbySubmittedByUserId: null,
    settingsConfirmedAt: null, settingsConfirmedByUserId: null, captainAReadyAt: null, captainBReadyAt: null,
    spectatorAdmissionEndsAt: null, reportedWinnerEntryId: null, resultReportedAt: null, resultReportedByUserId: null,
    resultConfirmedAt: null, resultConfirmedByUserId: null, resultEvidenceUrl: null,
    disputeReason: null, resolutionNote: null, resolvedAt: null, resolvedByUserId: null
  };
}
export async function recordSeriesGame(tx: Prisma.TransactionClient, match: {
  id: string; entryAId: string; entryBId: string; bestOf: number; startedAt: Date | null;
  resultEvidenceUrl: string | null; games: SeriesGame[];
}, winnerEntryId: string, userId: string, note?: string) {
  if (![match.entryAId, match.entryBId].includes(winnerEntryId)) throw new ConflictException("Invalid game winner");
  const gameNumber = match.games.filter((game) => !!game.winnerEntryId).length + 1;
  if (gameNumber > match.bestOf) throw new ConflictException("The series already has all its games");
  const now = new Date();
  const data = { winnerEntryId, startedAt: match.startedAt, completedAt: now,
    resultEvidenceUrl: match.resultEvidenceUrl, resolutionNote: note ?? null };
  await tx.dotaTournamentMatchGame.upsert({
    where: { matchId_gameNumber: { matchId: match.id, gameNumber } },
    create: { matchId: match.id, gameNumber, ...data }, update: data
  });
  const score = seriesScore(match.entryAId, match.entryBId, match.games);
  if (winnerEntryId === match.entryAId) score.A++; else score.B++;
  const complete = Math.max(score.A, score.B) >= Math.floor(match.bestOf / 2) + 1;
  await tx.dotaTournamentMatch.update({ where: { id: match.id }, data: complete ? {
    status: "COMPLETED", winnerEntryId, resultConfirmedAt: now, resultConfirmedByUserId: userId,
    disputeReason: null, ...(note ? { resolutionNote: note, resolvedByUserId: userId, resolvedAt: now } : {})
  } : nextGameState(now) });
  return complete;
}
