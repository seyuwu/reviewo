import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import type { PrismaService } from "../../database/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { DotaProfileService } from "../dota/services/dota-profile.service.js";
import type { GamePartiesService } from "../social/services/game-parties.service.js";
import type { AuthService } from "../auth/services/auth.service.js";
import type { DiscordVoiceService } from "../social/services/discord-voice.service.js";
import { DotaTournamentsService } from "./tournaments.service.js";
import { DotaTournamentBracketService } from "./tournament-bracket.service.js";
import { DotaTournamentRoomsService } from "./tournament-rooms.service.js";
import { TournamentRoomEvents } from "./tournament-room-events.js";

const connectionString = process.env["TOURNAMENT_ROOMS_TEST_DATABASE_URL"];
const rejectsStatus = (status: number) => (error: unknown) => {
  assert.equal((error as { getStatus(): number }).getStatus(), status);
  return true;
};
type Role = "1" | "2" | "3" | "4" | "5";

describe("Tournament reserves (isolated local PostgreSQL)", { skip: !connectionString }, () => {
  let prisma: PrismaClient;
  let service: DotaTournamentsService;
  let bracket: DotaTournamentBracketService;
  let rooms: DotaTournamentRoomsService;
  let users: AuthenticatedUser[];
  let slug: string;
  let tournamentId: string;
  let entryIds: string[];
  let tournamentIds: string[];

  before(async () => {
    const url = new URL(connectionString!);
    assert.ok(url.hostname === "127.0.0.1" ||
      (url.hostname === "postgres" && process.env["TOURNAMENT_ROOMS_QA_LOCAL_DOCKER"] === "1"));
    assert.equal(url.pathname, "/fdp_rooms_qa");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
    const db = prisma as unknown as PrismaService;
    bracket = new DotaTournamentBracketService(db);
    rooms = new DotaTournamentRoomsService(db, {} as AuthService,
      { isConfigured: () => false } as DiscordVoiceService, new TournamentRoomEvents());
    service = new DotaTournamentsService(db, {} as GamePartiesService, {
      getMyProfile: async (user: AuthenticatedUser) => ({
        title: user.displayName, slug: "reserve-qa-" + user.id, mmr: "4000",
        roles: ["1", "2", "3", "4", "5"]
      })
    } as unknown as DotaProfileService, bracket, rooms);
    users = await Promise.all(Array.from({ length: 26 }, (_, index) => prisma.user.create({ data: {
      displayName: "Reserve QA " + index,
      role: index === 24 ? "ADMIN" : index === 25 ? "TOURNAMENT_MODERATOR" : "USER"
    } })));
  });
  beforeEach(async () => {
    slug = "reserve-qa-" + randomUUID();
    const tournament = await prisma.dotaTournament.create({ data: {
      slug, title: "Reserve QA", status: "REGISTRATION_OPEN", maxTeams: 2,
      automaticBracket: true, createdByUserId: users[24]!.id
    } });
    tournamentId = tournament.id;
    tournamentIds = [tournamentId];
    entryIds = [];
    for (let team = 0; team < 4; team++) {
      await service.createSquad(slug, {
        name: "Squad " + team, positionRole: "1", joinMode: "OPEN"
      }, users[team * 5]!);
      const entry = await prisma.dotaTournamentEntry.findFirstOrThrow({
        where: { tournamentId, createdByUserId: users[team * 5]!.id }
      });
      entryIds.push(entry.id);
    }
  });
  afterEach(async () => {
    await prisma.dotaTournament.deleteMany({ where: { id: { in: tournamentIds } } });
  });
  after(async () => {
    if (users) await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    if (prisma) await prisma.$disconnect();
  });
  async function fill(team: number, count = 5) {
    for (let role = 2; role <= count; role++) {
      await service.joinEntry(slug, entryIds[team]!, { positionRole: String(role) as Role }, users[team * 5 + role - 1]!);
    }
  }
  async function close() { await fill(0); await fill(1); }
  async function readyMatch() {
    await close(); await fill(2);
    await service.update(slug, { status: "IN_PROGRESS" });
    return prisma.dotaTournamentMatch.findFirstOrThrow({ where: { tournamentId } });
  }

  it("creates new reserve squads after the main slots fill, without exceeding the limit", async () => {
    await close();
    await service.createSquad(slug, { name: "New reserve", positionRole: "1", joinMode: "OPEN" }, users[20]!);
    let view = await service.getPublic(slug);
    const reserve = view.entries.find((entry) => entry.teamName === "New reserve")!;
    assert.equal(reserve.status, "RESERVE");
    assert.equal(reserve.members.length, 1);
    assert.equal(view.registeredTeams, 2);
    await assert.rejects(service.createSquad(slug, { name: "Duplicate", positionRole: "2" }, users[20]!), rejectsStatus(409));
    for (let role = 2; role <= 5; role++) {
      await service.joinEntry(slug, reserve.id, { positionRole: String(role) as Role }, users[19 + role]!);
    }
    view = await service.getPublic(slug);
    assert.equal(view.entries.find((entry) => entry.id === reserve.id)!.members.length, 5);
    assert.equal(view.entries.find((entry) => entry.id === reserve.id)!.status, "RESERVE");
    assert.equal(view.registeredTeams, 2);
    assert.equal((await rooms.get(slug, reserve.id, users[20]!)).canReadChat, true);
    await service.update(slug, { status: "IN_PROGRESS" });
    await assert.rejects(service.createSquad(slug, { name: "Too late", positionRole: "1" }, users[25]!), rejectsStatus(409));
    assert.equal(await prisma.dotaTournamentBracketSeed.count({ where: { tournamentId } }), 2);
  });
  it("counts only complete main squads; a concurrent final slot cannot exceed the limit", async () => {
    const partyCount = await prisma.gameParty.count();
    const searchCount = await prisma.dotaSearchSession.count();
    await fill(0); await fill(1, 4); await fill(2, 4);
    await service.createSquad(slug, { name: "Fifth recruiting squad", positionRole: "1" }, users[20]!);
    const outcomes = await Promise.all([
      service.joinEntry(slug, entryIds[1]!, { positionRole: "5" }, users[9]!),
      service.joinEntry(slug, entryIds[2]!, { positionRole: "5" }, users[14]!)
    ]);
    assert.ok(outcomes.every((result) => result.result === "JOINED"));
    const view = await service.getPublic(slug);
    assert.equal(view.registeredTeams, 2);
    assert.equal(view.status, "REGISTRATION_CLOSED");
    assert.equal(view.entries.filter((entry) => entry.status === "RESERVE").length, 3);
    assert.equal(await prisma.gameParty.count(), partyCount);
    assert.equal(await prisma.dotaSearchSession.count(), searchCount);
  });

  it("keeps reserve roles exclusive, accepts captain-approved requests after closure, and preserves the main count", async () => {
    await close();
    await service.setEntryJoinMode(slug, entryIds[2]!, "CONFIRM", users[10]!);
    const request = await service.joinEntry(slug, entryIds[2]!, { positionRole: "2" }, users[11]!);
    assert.equal(request.result, "REQUESTED");
    const row = await prisma.dotaTournamentEntryRequest.findFirstOrThrow({ where: { entryId: entryIds[2]!, userId: users[11]!.id } });
    await assert.rejects(service.decideJoinRequest(slug, entryIds[2]!, row.id, "ACCEPT", users[15]!), rejectsStatus(403));
    await service.decideJoinRequest(slug, entryIds[2]!, row.id, "ACCEPT", users[10]!);
    await service.setEntryJoinMode(slug, entryIds[2]!, "OPEN", users[10]!);
    for (let role = 3; role <= 5; role++) {
      await service.joinEntry(slug, entryIds[2]!, { positionRole: String(role) as Role }, users[10 + role - 1]!);
    }
    const view = await service.getPublic(slug);
    assert.equal(view.registeredTeams, 2);
    assert.equal(view.entries.find((entry) => entry.id === entryIds[2])!.status, "RESERVE");
    assert.equal(view.entries.find((entry) => entry.id === entryIds[2])!.members.length, 5);
    await assert.rejects(service.joinEntry(slug, entryIds[3]!, { positionRole: "2" }, users[11]!), rejectsStatus(409));
  });

  it("handles concurrent claims for a reserve role without a sixth player or duplicate role", async () => {
    await close(); await fill(2, 4);
    const results = await Promise.allSettled([
      service.joinEntry(slug, entryIds[2]!, { positionRole: "5" }, users[14]!),
      service.joinEntry(slug, entryIds[2]!, { positionRole: "5" }, users[21]!)
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const members = await prisma.dotaTournamentEntryMember.findMany({ where: { entryId: entryIds[2]!, isActive: true } });
    assert.equal(members.length, 5);
    assert.equal(new Set(members.map((member) => member.positionRole)).size, 5);
  });

  it("permits reserve exits and captain transfer, but cannot withdraw a locked main squad and strand the bracket", async () => {
    await close();
    await service.joinEntry(slug, entryIds[2]!, { positionRole: "2" }, users[11]!);
    await service.leaveEntry(slug, entryIds[2]!, users[10]!);
    assert.equal((await rooms.get(slug, entryIds[2]!, users[11]!)).isCaptain, true);
    await service.joinEntry(slug, entryIds[2]!, { positionRole: "1" }, users[20]!);
    await service.removeEntryMember(slug, entryIds[2]!, users[20]!.id, users[11]!);
    await assert.rejects(service.leaveEntry(slug, entryIds[0]!, users[0]!), rejectsStatus(409));
    await assert.rejects(service.withdrawTeam(slug, entryIds[0]!, users[0]!), rejectsStatus(409));
    assert.equal((await service.getPublic(slug)).registeredTeams, 2);
    await service.withdrawTeam(slug, entryIds[3]!, users[15]!);
    assert.ok(!(await service.getPublic(slug)).entries.some((entry) => entry.id === entryIds[3]));
  });

  it("closes deadline registration into reserve before start, with public join availability", async () => {
    await prisma.dotaTournament.update({ where: { id: tournamentId }, data: {
      automaticBracket: false, registrationClosesAt: new Date(Date.now() - 1000)
    } });
    await (bracket as unknown as { scan(): Promise<void> }).scan();
    assert.equal((await service.getPublic(slug)).status, "REGISTRATION_CLOSED");
    assert.equal((await rooms.get(slug, entryIds[2]!)).canJoin, true);
    await service.joinEntry(slug, entryIds[2]!, { positionRole: "2" }, users[11]!);
  });

  it("seeds only main lineups and freezes reserve recruitment when the tournament starts", async () => {
    await readyMatch();
    assert.equal(await prisma.dotaTournamentBracketSeed.count({ where: { tournamentId } }), 2);
    assert.equal((await rooms.get(slug, entryIds[3]!)).canJoin, false);
    await assert.rejects(service.joinEntry(slug, entryIds[3]!, { positionRole: "2" }, users[16]!), rejectsStatus(409));
    assert.equal((await rooms.get(slug, entryIds[2]!, users[10]!)).canReadChat, true);
  });

  for (const staffIndex of [24, 25]) {
    it(`authorizes ${staffIndex === 24 ? "administrator" : "moderator"} substitution and preserves bracket progression`, async () => {
      const match = await readyMatch();
      await service.replaceMatchSideWithReserve(slug, match.id, { side: "A", reserveEntryId: entryIds[2]! }, users[staffIndex]!);
      const updated = await prisma.dotaTournamentMatch.findUniqueOrThrow({ where: { id: match.id } });
      assert.equal(updated.entryAId, entryIds[2]);
      assert.equal((await service.getPublic(slug)).registeredTeams, 2);
      assert.equal((await prisma.dotaTournamentEntry.findUniqueOrThrow({ where: { id: match.entryAId } })).status, "DISQUALIFIED");
      assert.equal((await prisma.dotaTournamentBracketSeed.findUniqueOrThrow({ where: { entryId: entryIds[2]! } })).tournamentId, tournamentId);
      assert.equal((await rooms.get(slug, match.entryAId)).phase, "CLOSED");
      assert.equal((await rooms.get(slug, entryIds[2]!, users[10]!)).canReadChat, true);
    });
  }

  it("replaces an unplayed no-show dispute instead of mistaking that dispute for a previous played match", async () => {
    const match = await readyMatch();
    await prisma.dotaTournamentMatch.update({ where: { id: match.id }, data: {
      status: "DISPUTED", disputeReason: "Lobby was not prepared", lobbyDeadlineAt: new Date(Date.now() - 1000)
    } });
    await service.replaceMatchSideWithReserve(slug, match.id, { side: "A", reserveEntryId: entryIds[2]! }, users[25]!);
    const updated = await prisma.dotaTournamentMatch.findUniqueOrThrow({ where: { id: match.id } });
    assert.equal(updated.status, "SCHEDULED");
    assert.equal(updated.disputeReason, null);
    assert.ok(updated.lobbyDeadlineAt > new Date());
    const opposingCaptain = match.entryBId === entryIds[0] ? users[0]! : users[5]!;
    const host = updated.hostSide === "A" ? users[10]! : opposingCaptain;
    await service.submitLobby(slug, match.id, {
      lobbyName: "Reserve QA lobby", lobbyPassword: "local-only", gameMode: "ALL_PICK",
      serverRegion: "EUROPE", allowSpectators: false, cheatsEnabled: false
    }, host);
    await service.confirmLobby(slug, match.id, { playersReady: true }, users[10]!);
    await service.confirmLobby(slug, match.id, { playersReady: true }, opposingCaptain);
    await service.startMatch(slug, match.id, host);
    await service.submitResult(slug, match.id, { winnerEntryId: entryIds[2]! }, users[10]!);
    await service.confirmResult(slug, match.id, opposingCaptain);
    assert.equal((await service.getPublic(slug)).status, "COMPLETED");
    assert.equal((await service.getPublic(slug)).podium[0]!.entryId, entryIds[2]);
  });

  it("rejects unprivileged, incomplete, future and started-match substitutions", async () => {
    const match = await readyMatch();
    const input = { side: "A" as const, reserveEntryId: entryIds[2]! };
    await assert.rejects(service.replaceMatchSideWithReserve(slug, match.id, input, users[10]!), rejectsStatus(403));
    await assert.rejects(service.replaceMatchSideWithReserve(slug, match.id, { ...input, reserveEntryId: entryIds[3]! }, users[24]!), rejectsStatus(409));
    await prisma.dotaTournamentMatch.update({ where: { id: match.id }, data: { scheduledAt: new Date(Date.now() + 60000) } });
    await assert.rejects(service.replaceMatchSideWithReserve(slug, match.id, input, users[24]!), rejectsStatus(409));
    await prisma.dotaTournamentMatch.update({ where: { id: match.id }, data: { scheduledAt: new Date(Date.now() - 1000), status: "IN_PROGRESS", startedAt: new Date() } });
    await assert.rejects(service.replaceMatchSideWithReserve(slug, match.id, input, users[24]!), rejectsStatus(409));
  });
});
