import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import type { PrismaService } from "../../database/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { GamePartiesService } from "../social/services/game-parties.service.js";
import type { DotaProfileService } from "../dota/services/dota-profile.service.js";
import { DotaTournamentsService } from "./tournaments.service.js";
import { DotaTournamentBracketService } from "./tournament-bracket.service.js";
import { DotaTournamentPlansService } from "./tournament-plans.service.js";

const connectionString = process.env["TOURNAMENT_ROOMS_TEST_DATABASE_URL"];
const rejectsStatus = (status: number) => (error: unknown) => {
  assert.equal((error as { getStatus(): number }).getStatus(), status); return true;
};
describe("Tournament series and empty bracket planning (local PostgreSQL)", { skip: !connectionString }, () => {
  let prisma: PrismaClient;
  let service: DotaTournamentsService;
  let plans: DotaTournamentPlansService;
  let users: AuthenticatedUser[];
  let slug: string;
  let tournamentId: string;
  let entryA: string;
  let entryB: string;
  let idCounter = 0;
  before(async () => {
    const url = new URL(connectionString!);
    assert.ok(url.hostname === "127.0.0.1" || url.hostname === "postgres" && process.env["TOURNAMENT_ROOMS_QA_LOCAL_DOCKER"] === "1");
    assert.equal(url.pathname, "/fdp_rooms_qa");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
    const db = prisma as unknown as PrismaService;
    plans = new DotaTournamentPlansService(db);
    service = new DotaTournamentsService(db, {} as GamePartiesService, {
      getMyProfile: async (user: AuthenticatedUser) => ({
        title: user.displayName, slug: "series-qa-" + user.id, mmr: "4000", roles: ["1", "2", "3", "4", "5"]
      })
    } as unknown as DotaProfileService, new DotaTournamentBracketService(db));
    users = await Promise.all(Array.from({ length: 12 }, (_, index) => prisma.user.create({ data: {
      displayName: "Series QA " + index, role: index === 6 ? "ADMIN" : index === 7 ? "TOURNAMENT_MODERATOR" : "USER"
    } })));
  });
  beforeEach(async () => {
    slug = "series-qa-" + randomUUID();
    const tournament = await prisma.dotaTournament.create({ data: {
      slug, title: "Series QA", status: "REGISTRATION_OPEN", automaticBracket: true,
      bracketFormat: "DOUBLE_ELIMINATION", maxTeams: 16, createdByUserId: users[6]!.id
    } });
    tournamentId = tournament.id;
  });
  afterEach(async () => { if (tournamentId) await prisma.dotaTournament.delete({ where: { id: tournamentId } }); });
  after(async () => {
    if (users) await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    if (prisma) await prisma.$disconnect();
  });
  async function fill() {
    await service.createSquad(slug, { name: "Alpha", positionRole: "1", joinMode: "OPEN" }, users[0]!);
    await service.createSquad(slug, { name: "Beta", positionRole: "1", joinMode: "OPEN" }, users[1]!);
    const entries = await prisma.dotaTournamentEntry.findMany({ where: { tournamentId } });
    entryA = entries.find((entry) => entry.teamNameSnapshot === "Alpha")!.id;
    entryB = entries.find((entry) => entry.teamNameSnapshot === "Beta")!.id;
    for (let index = 0; index < 4; index++) {
      await service.joinEntry(slug, entryA, { positionRole: String(index + 2) as "2" | "3" | "4" | "5" }, users[index + 2]!);
      await service.joinEntry(slug, entryB, { positionRole: String(index + 2) as "2" | "3" | "4" | "5" }, users[index + 8]!);
    }
    await service.update(slug, { status: "IN_PROGRESS" });
    return prisma.dotaTournamentMatch.findFirstOrThrow({ where: { tournamentId, bracketKind: "MAIN" } });
  }
  const captain = (entryId: string) => entryId === entryA ? users[0]! : users[1]!;
  async function prepare(matchId: string) {
    const match = await prisma.dotaTournamentMatch.findUniqueOrThrow({ where: { id: matchId } });
    const host = captain(match.hostSide === "A" ? match.entryAId : match.entryBId);
    await service.submitLobby(slug, matchId, {
      lobbyName: "Series QA lobby", lobbyPassword: "qa-only", allowSpectators: false,
      cheatsEnabled: false, gameMode: "ALL_PICK", serverRegion: "EUROPE"
    }, host);
    await service.confirmLobby(slug, matchId, { playersReady: true }, captain(match.entryAId));
    await service.confirmLobby(slug, matchId, { playersReady: true }, captain(match.entryBId));
    return { match, host };
  }
  async function game(matchId: string, winner: string) {
    const { match, host } = await prepare(matchId);
    await service.startMatch(slug, matchId, host);
    await service.submitResult(slug, matchId, { winnerEntryId: winner }, captain(match.entryAId));
    return service.confirmResult(slug, matchId, captain(match.entryBId));
  }
  it("staff can forfeit an entire BO3 before lobby creation and advance the bracket", async () => {
    await plans.save(slug, { bracketKind: "MAIN", roundOffset: 0, matchNumber: 1, bestOf: 3 }, users[6]!);
    const upper = await fill();
    await assert.rejects(service.resolveAdminMatch(upper.id, { resolution: "ENTRY_B_SERIES", note: "No show" }, users[0]!), rejectsStatus(403));
    const result = await service.resolveAdminMatch(upper.id, { resolution: "ENTRY_B_SERIES", note: "No show" }, users[7]!);
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.winnerEntryId, upper.entryBId);
    assert.equal(result.technicalVictory, true);
    assert.equal(result.hasStarted, false);
    const grand = await prisma.dotaTournamentMatch.findFirstOrThrow({ where: { tournamentId, bracketKind: "GRAND_FINAL" } });
    assert.equal(grand.entryAId, upper.entryBId);
    await assert.rejects(service.resolveAdminMatch(upper.id, { resolution: "ENTRY_A_SERIES", note: "Duplicate" }, users[6]!), rejectsStatus(409));
  });
  it("staff can forfeit a BO3 between games and during an active game without losing played results", async () => {
    await plans.save(slug, { bracketKind: "MAIN", roundOffset: 0, matchNumber: 1, bestOf: 3 }, users[6]!);
    const upper = await fill();
    await game(upper.id, upper.entryAId);
    const result = await service.resolveAdminMatch(upper.id, { resolution: "ENTRY_B_SERIES", note: "Team withdrew" }, users[6]!);
    assert.equal(result.status, "COMPLETED");
    assert.equal(result.winnerEntryId, upper.entryBId);
    assert.equal(result.gameResults.length, 1);
    assert.deepEqual(result.score, { A: 1, B: 0 });
    const grand = await prisma.dotaTournamentMatch.findFirstOrThrow({ where: { tournamentId, bracketKind: "GRAND_FINAL" } });
    const ready = await prepare(grand.id);
    await service.startMatch(slug, grand.id, ready.host);
    const finished = await service.resolveAdminMatch(grand.id, { resolution: "ENTRY_A_SERIES", note: "Technical defeat" }, users[7]!);
    assert.equal(finished.status, "COMPLETED");
    assert.equal(finished.winnerEntryId, grand.entryAId);
    assert.equal(finished.technicalVictory, true);
    assert.equal((await prisma.dotaTournament.findUniqueOrThrow({ where: { id: tournamentId } })).status, "COMPLETED");
  });
  it("plans BO and time before any teams exist; final plans survive a smaller real bracket", async () => {
    const when = new Date(Date.now() + 120000).toISOString();
    const planned = await plans.save(slug, {
      bracketKind: "MAIN", roundOffset: 0, matchNumber: 1, bestOf: 3, scheduledAt: when
    }, users[6]!);
    assert.equal(planned.planning, true);
    assert.ok(planned.bracket!.nodes.every((node) => !node.entryAId && !node.entryBId));
    assert.equal(await prisma.dotaTournamentMatch.count({ where: { tournamentId } }), 0);
    const upper = await fill();
    assert.equal(upper.bestOf, 3);
    assert.equal(upper.roundNumber, 1);
    assert.equal(upper.scheduledAt.toISOString(), when);
    await assert.rejects(service.startMatch(slug, upper.id, captain(upper.entryAId)), rejectsStatus(409));
    await plans.saveMatch(upper.id, { scheduledAt: null }, users[7]!);
    assert.ok((await prisma.dotaTournamentMatch.findUniqueOrThrow({ where: { id: upper.id } })).scheduledAt <= new Date());
  });
  it("BO3 keeps scores between games, rejects duplicate confirmations and saves one ID per game", async () => {
    await plans.save(slug, { bracketKind: "MAIN", roundOffset: 0, matchNumber: 1, bestOf: 3 }, users[6]!);
    await plans.save(slug, { bracketKind: "GRAND_FINAL", roundOffset: 0, matchNumber: 1, bestOf: 5 }, users[7]!);
    const upper = await fill();
    const ready = await prepare(upper.id);
    await service.startMatch(slug, upper.id, ready.host);
    await service.submitResult(slug, upper.id, { winnerEntryId: entryA }, captain(upper.entryAId));
    const confirmations = await Promise.allSettled([
      service.confirmResult(slug, upper.id, captain(upper.entryBId)),
      service.confirmResult(slug, upper.id, captain(upper.entryBId))
    ]);
    assert.equal(confirmations.filter((item) => item.status === "fulfilled").length, 1);
    let current = await service.getParticipantMatch(slug, upper.id, users[0]!);
    assert.equal(current.status, "SCHEDULED");
    assert.deepEqual(current.score, { A: 1, B: 0 });
    assert.equal(current.gameNumber, 2);
    assert.equal(await prisma.dotaTournamentMatch.count({ where: { tournamentId } }), 1);
    await assert.rejects(plans.saveMatch(upper.id, { bestOf: 5 }, users[7]!), rejectsStatus(409));
    const firstId = String(8000000000000 + ++idCounter);
    await service.submitMatchGameId(slug, upper.id, { gameNumber: 1, dotaMatchId: firstId }, users[0]!);
    current = await game(upper.id, entryB);
    assert.deepEqual(current.score, { A: 1, B: 1 });
    await assert.rejects(service.submitMatchGameId(slug, upper.id, { gameNumber: 2, dotaMatchId: firstId }, users[1]!), rejectsStatus(409));
    await service.submitMatchGameId(slug, upper.id, { gameNumber: 2, dotaMatchId: String(8000000000000 + ++idCounter) }, users[1]!);
    current = await game(upper.id, entryA);
    assert.equal(current.status, "COMPLETED");
    assert.deepEqual(current.score, { A: 2, B: 1 });
    assert.equal(current.gameResults.length, 3);
    const next = await prisma.dotaTournamentMatch.findFirstOrThrow({ where: { tournamentId, bracketKind: "GRAND_FINAL" } });
    assert.equal(next.bestOf, 5);
    assert.equal(next.entryAId, entryA);
    assert.equal(next.entryBId, entryB);
  });
  it("the grand final decides the champion even when the lower bracket team wins", async () => {
    await plans.save(slug, { bracketKind: "GRAND_FINAL", roundOffset: 0, matchNumber: 1, bestOf: 5 }, users[6]!);
    const upper = await fill();
    await game(upper.id, entryA);
    const grand = await prisma.dotaTournamentMatch.findFirstOrThrow({ where: { tournamentId, bracketKind: "GRAND_FINAL" } });
    for (const winner of [entryB, entryA, entryB, entryA, entryB]) await game(grand.id, winner);
    const current = await service.getParticipantMatch(slug, grand.id, users[0]!);
    assert.deepEqual(current.score, { A: 2, B: 3 });
    assert.equal(current.gameResults.length, 5);
    assert.equal((await prisma.dotaTournament.findUniqueOrThrow({ where: { id: tournamentId } })).status, "COMPLETED");
    const completed = await service.getPublic(slug);
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.podium[0]!.entryId, entryB);
    assert.equal(completed.podium[1]!.entryId, entryA);
  });
  it("limits editing to staff and safe stages; replay preserves completed games", async () => {
    await assert.rejects(plans.get(slug, users[0]!), rejectsStatus(403));
    await assert.rejects(plans.save(slug, { bracketKind: "MAIN", roundOffset: 0, matchNumber: 1, bestOf: 3 }, users[0]!), rejectsStatus(403));
    await plans.save(slug, { bracketKind: "MAIN", roundOffset: 0, matchNumber: 1, bestOf: 5 }, users[7]!);
    const upper = await fill();
    await game(upper.id, entryA);
    const { host } = await prepare(upper.id);
    await plans.saveMatch(upper.id, { scheduledAt: new Date(Date.now() + 120000).toISOString() }, users[7]!);
    await assert.rejects(service.startMatch(slug, upper.id, host), rejectsStatus(409));
    await plans.saveMatch(upper.id, { scheduledAt: null }, users[6]!);
    await service.startMatch(slug, upper.id, host);
    await assert.rejects(plans.saveMatch(upper.id, { scheduledAt: null }, users[7]!), rejectsStatus(409));
    await service.submitResult(slug, upper.id, { winnerEntryId: entryB }, captain(upper.entryAId));
    await service.disputeMatch(slug, upper.id, { reason: "Replay QA" }, captain(upper.entryBId));
    await service.resolveAdminMatch(upper.id, { resolution: "REPLAY", note: "Replay only game two" }, users[7]!);
    const replay = await service.getParticipantMatch(slug, upper.id, users[0]!);
    assert.deepEqual(replay.score, { A: 1, B: 0 });
    assert.equal(replay.gameNumber, 2);
    assert.equal(replay.gameResults.length, 1);
    assert.equal(replay.status, "SCHEDULED");
    await assert.rejects(service.update(slug, { bracketFormat: "SINGLE_ELIMINATION" }), rejectsStatus(409));
  });
});
