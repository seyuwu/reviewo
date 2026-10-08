import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import type { PrismaService } from "../../database/prisma.service.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { AuthService } from "../auth/services/auth.service.js";
import type { DiscordVoiceService } from "../social/services/discord-voice.service.js";
import type { GamePartiesService } from "../social/services/game-parties.service.js";
import type { DotaProfileService } from "../dota/services/dota-profile.service.js";
import { DotaTournamentBracketService } from "./tournament-bracket.service.js";
import { DotaTournamentsService } from "./tournaments.service.js";
import { DotaTournamentRoomsService } from "./tournament-rooms.service.js";
import { TournamentRoomEvents } from "./tournament-room-events.js";
import { TournamentMatchChatService } from "./tournament-match-chat.service.js";
import { tournamentRoomState, TOURNAMENT_AFTERPARTY_MS } from "./tournament-room-policy.js";

const connectionString = process.env["TOURNAMENT_ROOMS_TEST_DATABASE_URL"];
const rejectsStatus = (status: number) => (error: unknown) => {
  assert.equal((error as { getStatus(): number }).getStatus(), status);
  return true;
};

describe("Tournament team rooms (isolated local PostgreSQL)", { skip: !connectionString }, () => {
  let prisma: PrismaClient;
  let service: DotaTournamentsService;
  let rooms: DotaTournamentRoomsService;
  let users: AuthenticatedUser[];
  let slug: string;
  let parallelSlug: string;
  let entryA: string;
  let entryB: string;
  let createdChannels: number;
  let deleteWorks: boolean;
  let channels: Set<string>;
  let grants: Set<string>;
  let tournamentIds: string[];

  before(async () => {
    const url = new URL(connectionString!);
    assert.ok(url.hostname === "127.0.0.1" ||
      (url.hostname === "postgres" && process.env["TOURNAMENT_ROOMS_QA_LOCAL_DOCKER"] === "1"),
      "Tests must run against local PostgreSQL");
    assert.equal(url.pathname, "/fdp_rooms_qa", "Only the disposable room QA database is allowed");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
    const db = prisma as unknown as PrismaService;
    const discord = {
      isConfigured: () => true,
      getGuildId: () => "mock-guild",
      createPartyVoice: async (input: { strictAccess?: boolean }) => {
        assert.equal(input.strictAccess, true);
        const channelId = "mock-channel-" + ++createdChannels;
        channels.add(channelId);
        return { channelId, inviteUrl: "https://discord.gg/mock-only" };
      },
      ensureVoiceChannelAcl: async () => undefined,
      grantMemberVoiceAccess: async (channel: string, identity: string) => { grants.add(channel + ":" + identity); },
      revokeMemberVoiceAccess: async (channel: string, identity: string) => { grants.delete(channel + ":" + identity); },
      createJoinInvite: async () => "https://discord.gg/mock-only",
      tryMoveMemberToVoice: async () => false,
      deleteChannel: async (id: string) => { if (!deleteWorks) return false; channels.delete(id); return true; }
    } as unknown as DiscordVoiceService;
    rooms = new DotaTournamentRoomsService(db, {
      getDiscordUserId: async (id: string) => "mock-" + id.slice(0, 20)
    } as unknown as AuthService, discord, new TournamentRoomEvents());
    service = new DotaTournamentsService(db, {} as GamePartiesService, {
      getMyProfile: async (user: AuthenticatedUser) => ({
        title: user.displayName, slug: "room-qa-" + user.id, mmr: "4000", roles: ["1", "2", "3", "4", "5"]
      })
    } as unknown as DotaProfileService, new DotaTournamentBracketService(db), rooms);
    users = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      prisma.user.create({ data: { displayName: "Room QA " + index, role: index === 6 ? "ADMIN" : index === 7 ? "TOURNAMENT_MODERATOR" : "USER" } })
    ));
  });

  beforeEach(async () => {
    createdChannels = 0;
    channels = new Set();
    grants = new Set();
    deleteWorks = true;
    slug = "room-qa-" + randomUUID();
    parallelSlug = "room-parallel-" + randomUUID();
    tournamentIds = [];
    for (const currentSlug of [slug, parallelSlug]) {
      const tournament = await prisma.dotaTournament.create({ data: {
        slug: currentSlug, title: "Room QA tournament", status: "REGISTRATION_OPEN",
        automaticBracket: false, createdByUserId: users[6]!.id
      } });
      tournamentIds.push(tournament.id);
    }
    await service.createSquad(slug, { name: "Alpha", positionRole: "1", joinMode: "OPEN" }, users[0]!);
    await service.createSquad(slug, { name: "Beta", positionRole: "1", joinMode: "CONFIRM" }, users[1]!);
    const entries = await prisma.dotaTournamentEntry.findMany({ where: { tournamentId: tournamentIds[0]! } });
    entryA = entries.find((entry) => entry.teamNameSnapshot === "Alpha")!.id;
    entryB = entries.find((entry) => entry.teamNameSnapshot === "Beta")!.id;
  });
  afterEach(async () => {
    await prisma.dotaTournament.deleteMany({ where: { id: { in: tournamentIds } } });
  });
  after(async () => {
    if (users) await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    if (prisma) await prisma.$disconnect();
  });

  it("persists a public team description and limits edits to its captain", async () => {
    assert.equal((await rooms.get(slug, entryA, users[0]!)).description, "");
    assert.equal((await rooms.get(slug, entryA, users[0]!)).canEditDescription, true);
    await service.joinEntry(slug, entryA, { positionRole: "2" }, users[2]!);
    for (const user of [users[1]!, users[2]!, users[3]!, users[6]!, users[7]!]) {
      assert.equal((await rooms.get(slug, entryA, user)).canEditDescription, false);
      await assert.rejects(rooms.updateDescription(slug, entryA, user, "Unauthorized"), rejectsStatus(403));
    }
    const result = await rooms.updateDescription(slug, entryA, users[0]!, "  Play evenings\nLooking for support  ");
    assert.equal(result.description, "Play evenings\nLooking for support");
    const outsider = await rooms.get(slug, entryA, users[3]!);
    assert.equal(outsider.canReadChat, false);
    assert.equal(outsider.description, result.description);
    assert.equal((await rooms.get(slug, entryB, users[1]!)).description, "");
    await assert.rejects(rooms.updateDescription(parallelSlug, entryA, users[0]!, "Wrong tournament"), rejectsStatus(404));
    await assert.rejects(rooms.updateDescription(slug, entryA, users[0]!, "a".repeat(1001)), rejectsStatus(400));
    await rooms.updateDescription(slug, entryA, users[0]!, "a".repeat(1000));
    assert.equal((await rooms.get(slug, entryA)).description.length, 1000);
    await rooms.updateDescription(slug, entryA, users[0]!, "   ");
    assert.equal((await rooms.get(slug, entryA)).description, "");
  });

  it("transfers description permissions with captaincy and freezes closed rooms", async () => {
    await service.joinEntry(slug, entryA, { positionRole: "2" }, users[2]!);
    await rooms.updateDescription(slug, entryA, users[0]!, "Original description");
    await service.leaveEntry(slug, entryA, users[0]!);
    await assert.rejects(rooms.updateDescription(slug, entryA, users[0]!, "Former captain"), rejectsStatus(403));
    assert.equal((await rooms.get(slug, entryA, users[2]!)).canEditDescription, true);
    await rooms.updateDescription(slug, entryA, users[2]!, "New captain");
    await prisma.dotaTournament.update({ where: { id: tournamentIds[0]! }, data: { status: "IN_PROGRESS" } });
    await rooms.updateDescription(slug, entryA, users[2]!, "Still playing");
    await prisma.dotaTournament.update({ where: { id: tournamentIds[0]! }, data: {
      status: "COMPLETED", finishedAt: new Date(Date.now() - TOURNAMENT_AFTERPARTY_MS - 1000)
    } });
    assert.equal((await rooms.get(slug, entryA, users[2]!)).canEditDescription, false);
    await assert.rejects(rooms.updateDescription(slug, entryA, users[2]!, "Expired"), rejectsStatus(403));
    assert.equal((await rooms.get(slug, entryA)).description, "Still playing");
  });

  it("restricts match chat to participants and staff and enforces a shared mention cooldown", async () => {
    const chat = new TournamentMatchChatService(prisma as unknown as PrismaService, new TournamentRoomEvents());
    const match = await prisma.dotaTournamentMatch.create({ data: {
      tournamentId: tournamentIds[0]!, entryAId: entryA, entryBId: entryB,
      roundNumber: 1, matchNumber: 1, scheduledAt: new Date(), lobbyDeadlineAt: new Date(Date.now() + 900000),
      gameMode: "ALL_PICK", serverRegion: "EUROPE", createdByUserId: users[6]!.id
    } });
    await assert.rejects(chat.list(slug, match.id, users[3]!), rejectsStatus(403));
    await assert.rejects(chat.send(slug, match.id, users[0]!, "invalid target", [users[3]!.id]), rejectsStatus(400));
    await chat.send(slug, match.id, users[6]!, "Administrator message");
    const sent = await Promise.all([
      chat.send(slug, match.id, users[0]!, "mention one", [users[1]!.id]),
      chat.send(slug, match.id, users[7]!, "mention two", [users[1]!.id])
    ]);
    assert.equal(sent.length, 2);
    assert.equal((await chat.inbox(users[1]!)).count, 1);
    const inbox = await chat.inbox(users[1]!);
    await chat.readMention(inbox.items[0]!.id, users[1]!);
    assert.equal((await chat.inbox(users[1]!)).count, 0);
    assert.equal((await chat.list(slug, match.id, users[7]!)).messages.length, 3);
    await prisma.dotaTournament.update({ where: { id: tournamentIds[0]! },
      data: { status: "COMPLETED", finishedAt: new Date(Date.now() - TOURNAMENT_AFTERPARTY_MS - 1000) } });
    await assert.rejects(chat.list(slug, match.id, users[6]!), rejectsStatus(404));
  });
  it("allows parallel tournaments, forbids a second team in one event, and never changes matchmaking", async () => {
    const partyCount = await prisma.gameParty.count();
    const searchCount = await prisma.dotaSearchSession.count();
    await assert.rejects(service.createSquad(slug, { name: "Duplicate", positionRole: "2" }, users[0]!), rejectsStatus(409));
    await assert.rejects(service.joinEntry(slug, entryB, { positionRole: "2" }, users[0]!), rejectsStatus(409));
    await service.createSquad(parallelSlug, { name: "Parallel", positionRole: "1" }, users[0]!);
    assert.equal((await rooms.listMine(users[0]!)).length, 2);
    await service.joinEntry(slug, entryA, { positionRole: "2" }, users[2]!);
    await assert.rejects(service.joinEntry(slug, entryB, { positionRole: "3" }, users[2]!), rejectsStatus(409));
    assert.equal(await prisma.gameParty.count(), partyCount);
    assert.equal(await prisma.dotaSearchSession.count(), searchCount);
  });

  it("authorizes private chat, administrator and moderator posting, and scoped pagination", async () => {
    await rooms.sendMessage(slug, entryA, users[0]!, "<b>plain text</b>");
    await rooms.sendMessage(slug, entryA, users[0]!, "second");
    await rooms.sendMessage(slug, entryA, users[0]!, "third");
    const last = await rooms.listMessages(slug, entryA, users[0]!, undefined, 2);
    assert.deepEqual(last.messages.map((message) => message.body), ["second", "third"]);
    assert.ok(last.nextCursor);
    assert.equal((await rooms.listMessages(slug, entryA, users[6]!)).messages.length, 3);
    assert.equal((await rooms.listMessages(slug, entryA, users[7]!)).messages.length, 3);
    for (const staff of [users[6]!, users[7]!]) {
      assert.equal((await rooms.get(slug, entryA, staff)).canReadChat, true);
      assert.equal((await rooms.get(slug, entryA, staff)).isMember, false);
      assert.equal((await rooms.get(slug, entryA, staff)).canWriteChat, true);
      await rooms.requireReader(slug, entryA, staff);
      const staffMessage = await rooms.sendMessage(slug, entryA, staff, "staff message");
      assert.equal(staffMessage.senderUserId, staff.id);
      assert.equal(staffMessage.senderName, staff.displayName);
      await assert.rejects(rooms.ensureVoice(slug, entryA, staff, "create"), rejectsStatus(403));
    }
    assert.equal((await rooms.get(slug, entryA, users[3]!)).canReadChat, false);
    assert.equal((await rooms.get(slug, entryA)).members[0]!.userId, null);
    await assert.rejects(rooms.listMessages(slug, entryA, users[3]!), rejectsStatus(403));
    await assert.rejects(rooms.sendMessage(slug, entryA, users[0]!, " ".repeat(2)), rejectsStatus(400));
    const older = await rooms.listMessages(slug, entryA, users[0]!, last.nextCursor!, 2);
    assert.equal(older.messages[0]!.body, "<b>plain text</b>");
    await assert.rejects(rooms.listMessages(slug, entryB, users[1]!, last.nextCursor!), rejectsStatus(400));
  });

  it("accepts requests, lets players choose free roles and transfers captaincy before start", async () => {
    const pending = await service.joinEntry(slug, entryB, { positionRole: "2" }, users[2]!);
    assert.equal(pending.result, "REQUESTED");
    const request = await prisma.dotaTournamentEntryRequest.findFirstOrThrow({ where: { entryId: entryB, userId: users[2]!.id } });
    await assert.rejects(rooms.sendMessage(slug, entryB, users[2]!, "not yet"), rejectsStatus(403));
    await service.decideJoinRequest(slug, entryB, request.id, "ACCEPT", users[1]!);
    await service.assignEntryPosition(slug, entryB, "3", users[2]!);
    await assert.rejects(service.assignEntryPosition(slug, entryB, "1", users[2]!), rejectsStatus(409));
    await service.leaveEntry(slug, entryB, users[1]!);
    assert.equal((await rooms.get(slug, entryB, users[2]!)).isCaptain, true);
    await assert.rejects(service.setEntryJoinMode(slug, entryB, "OPEN", users[1]!), rejectsStatus(403));
    await service.setEntryJoinMode(slug, entryB, "OPEN", users[2]!);
    await service.joinEntry(slug, entryA, { positionRole: "2" }, users[1]!);
    await assert.rejects(rooms.listMessages(slug, entryB, users[1]!), rejectsStatus(403));
  });

  it("creates a single voice under concurrent requests and revokes access after removal", async () => {
    await service.joinEntry(slug, entryA, { positionRole: "2" }, users[2]!);
    const results = await Promise.all([
      rooms.ensureVoice(slug, entryA, users[0]!, "create"),
      rooms.ensureVoice(slug, entryA, users[2]!, "join")
    ]);
    assert.equal(createdChannels, 1);
    assert.equal(results[0]!.channelId, results[1]!.channelId);
    assert.equal(grants.size, 1);
    await assert.rejects(rooms.ensureVoice(slug, entryA, users[3]!, "create"), rejectsStatus(403));
    await service.removeEntryMember(slug, entryA, users[2]!.id, users[0]!);
    assert.equal(grants.size, 0);
    await assert.rejects(rooms.ensureVoice(slug, entryA, users[2]!, "join"), rejectsStatus(403));
    await assert.rejects(rooms.listMessages(slug, entryA, users[2]!), rejectsStatus(403));
  });

  it("locks active match rosters and retains exactly a twelve-hour afterparty", async () => {
    await service.joinEntry(slug, entryA, { positionRole: "2" }, users[2]!);
    await rooms.sendMessage(slug, entryA, users[0]!, "retain after tournament");
    await prisma.dotaTournament.update({ where: { id: tournamentIds[0]! }, data: { status: "IN_PROGRESS" } });
    await assert.rejects(service.leaveEntry(slug, entryA, users[2]!), rejectsStatus(409));
    await assert.rejects(service.removeEntryMember(slug, entryA, users[2]!.id, users[0]!), rejectsStatus(409));
    await service.update(slug, { status: "COMPLETED" });
    const tournament = await prisma.dotaTournament.findUniqueOrThrow({ where: { id: tournamentIds[0]! } });
    const room = await prisma.dotaTournamentRoom.findUniqueOrThrow({ where: { entryId: entryA } });
    assert.equal(room.expiresAt!.getTime() - tournament.finishedAt!.getTime(), TOURNAMENT_AFTERPARTY_MS);
    assert.equal((await rooms.get(slug, entryA, users[2]!)).phase, "AFTERPARTY");
    await rooms.sendMessage(slug, entryA, users[2]!, "afterparty message");
    await rooms.leaveAfterparty(slug, entryA, users[2]!);
    const member = await prisma.dotaTournamentEntryMember.findUniqueOrThrow({ where: { entryId_userId: { entryId: entryA, userId: users[2]!.id } } });
    assert.equal(member.isActive, true, "Historical lineup must survive afterparty departures");
    assert.ok(member.roomLeftAt);
    await assert.rejects(rooms.listMessages(slug, entryA, users[2]!), rejectsStatus(403));
    assert.equal((await service.getPublic(slug)).entries.find((entry) => entry.id === entryA)!.members.length, 2);
    await assert.rejects(service.update(slug, { status: "REGISTRATION_OPEN" }), rejectsStatus(409));
    const atBoundary = new Date(tournament.finishedAt!.getTime() + TOURNAMENT_AFTERPARTY_MS);
    assert.equal(tournamentRoomState({ status: "REGISTERED" }, tournament, atBoundary).phase, "CLOSED");
  });

  it("deletes expired chat and voice while preserving event history, retrying Discord failure", async () => {
    await rooms.sendMessage(slug, entryA, users[0]!, "ephemeral");
    await rooms.ensureVoice(slug, entryA, users[0]!, "join");
    const finishedAt = new Date(Date.now() - TOURNAMENT_AFTERPARTY_MS - 1000);
    await prisma.dotaTournament.update({ where: { id: tournamentIds[0]! }, data: { status: "COMPLETED", finishedAt } });
    await prisma.dotaTournamentRoom.update({ where: { entryId: entryA }, data: { expiresAt: new Date(finishedAt.getTime() + TOURNAMENT_AFTERPARTY_MS) } });
    await assert.rejects(rooms.listMessages(slug, entryA, users[0]!), rejectsStatus(404));
    await assert.rejects(rooms.listMessages(slug, entryA, users[6]!), rejectsStatus(404));
    await assert.rejects(rooms.listMessages(slug, entryA, users[7]!), rejectsStatus(404));
    deleteWorks = false;
    await rooms.cleanupExpired();
    assert.equal(await prisma.dotaTournamentRoomMessage.count(), 0);
    assert.ok(await prisma.dotaTournamentRoom.findUnique({ where: { entryId: entryA } }));
    deleteWorks = true;
    await rooms.cleanupExpired();
    assert.equal(channels.size, 0);
    assert.equal(await prisma.dotaTournamentRoom.count(), 0);
    assert.equal(await prisma.dotaTournamentRoomVoiceGrant.count(), 0);
    assert.equal(await prisma.dotaTournamentEntry.count({ where: { id: entryA } }), 1);
    assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { entryId: entryA, isActive: true } }), 1);
  });

  it("withdraws an empty squad and removes its live room", async () => {
    await rooms.sendMessage(slug, entryA, users[0]!, "empty soon");
    await service.leaveEntry(slug, entryA, users[0]!);
    assert.equal((await rooms.get(slug, entryA, users[0]!)).phase, "CLOSED");
    assert.equal((await prisma.dotaTournamentEntry.findUniqueOrThrow({ where: { id: entryA } })).status, "WITHDRAWN");
    await rooms.cleanupExpired();
    assert.equal(await prisma.dotaTournamentRoom.count(), 0);
    await service.joinEntry(slug, entryB, { positionRole: "2" }, users[0]!);
  });

  it("repairs an expiry missed during concurrent voice creation and tournament completion", async () => {
    await rooms.sendMessage(slug, entryA, users[0]!, "repair expiry");
    await prisma.dotaTournament.update({ where: { id: tournamentIds[0]! }, data: {
      status: "COMPLETED", finishedAt: new Date(Date.now() - TOURNAMENT_AFTERPARTY_MS - 1000)
    } });
    assert.equal((await prisma.dotaTournamentRoom.findUniqueOrThrow({ where: { entryId: entryA } })).expiresAt, null);
    await rooms.cleanupExpired();
    assert.equal(await prisma.dotaTournamentRoom.count(), 0);
  });

  it("starts twelve-hour rooms when the automatic bracket finishes without altering the podium", async () => {
    for (let index = 0; index < 4; index++) {
      await service.joinEntry(slug, entryA, { positionRole: String(index + 2) as "2" | "3" | "4" | "5" }, users[index + 2]!);
    }
    await service.setEntryJoinMode(slug, entryB, "OPEN", users[1]!);
    for (let index = 0; index < 4; index++) {
      await service.joinEntry(slug, entryB, { positionRole: String(index + 2) as "2" | "3" | "4" | "5" }, users[index + 8]!);
    }
    await rooms.sendMessage(slug, entryA, users[0]!, "final room");
    await rooms.sendMessage(slug, entryB, users[1]!, "other final room");
    await prisma.dotaTournament.update({ where: { id: tournamentIds[0]! }, data: { automaticBracket: true } });
    await service.update(slug, { status: "IN_PROGRESS" });
    const final = await prisma.dotaTournamentMatch.findFirstOrThrow({ where: { tournamentId: tournamentIds[0]! } });
    await prisma.dotaTournamentMatch.update({ where: { id: final.id }, data: { status: "COMPLETED", winnerEntryId: entryA } });
    const bracket = new DotaTournamentBracketService(prisma as unknown as PrismaService);
    await bracket.reconcile(tournamentIds[0]!);
    const finished = await prisma.dotaTournament.findUniqueOrThrow({ where: { id: tournamentIds[0]! } });
    assert.equal(finished.status, "COMPLETED");
    const liveRooms = await prisma.dotaTournamentRoom.findMany();
    assert.equal(liveRooms.length, 2);
    for (const liveRoom of liveRooms)
      assert.equal(liveRoom.expiresAt!.getTime(), finished.finishedAt!.getTime() + TOURNAMENT_AFTERPARTY_MS);
    await bracket.reconcile(tournamentIds[0]!);
    assert.equal((await prisma.dotaTournament.findUniqueOrThrow({ where: { id: finished.id } })).finishedAt!.getTime(), finished.finishedAt!.getTime());
    const history = await service.getPublic(slug);
    assert.equal(history.podium[0]!.entryId, entryA);
    assert.equal(history.podium[0]!.members.length, 5);
  });
});
