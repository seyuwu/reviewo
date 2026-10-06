import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { PrismaService } from "../../database/prisma.service.js";
import type { DotaProfileService } from "../dota/services/dota-profile.service.js";
import type { GamePartiesService } from "../social/services/game-parties.service.js";
import { DotaTournamentBracketService } from "./tournament-bracket.service.js";
import { DotaTournamentsService } from "./tournaments.service.js";

const connectionString = process.env["TOURNAMENT_TEST_DATABASE_URL"];

describe(
  "Tournament spectator admission (isolated PostgreSQL)",
  { skip: !connectionString },
  () => {
    let prisma: PrismaClient;
    let service: DotaTournamentsService;
    let users: AuthenticatedUser[];
    let tournamentId: string;
    let slug: string;
    let matchId: string;
    let entryBId: string;

    before(async () => {
      const url = new URL(connectionString!);
      assert.equal(url.hostname, "127.0.0.1");
      assert.equal(
        url.pathname,
        "/fdp_spectator_qa",
        "Tests require the dedicated disposable database"
      );
      prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString! }) });
      const db = prisma as unknown as PrismaService;
      service = new DotaTournamentsService(
        db,
        {} as GamePartiesService,
        {} as DotaProfileService,
        new DotaTournamentBracketService(db)
      );
      users = await Promise.all(
        Array.from({ length: 11 }, (_, index) =>
          prisma.user.create({ data: { displayName: `Spectator QA ${index}` } })
        )
      );
    });

    beforeEach(async () => {
      slug = `spectator-qa-${randomUUID()}`;
      const tournament = await prisma.dotaTournament.create({
        data: {
          slug,
          title: "Spectator admission QA",
          createdByUserId: users[0]!.id,
          status: "IN_PROGRESS",
          automaticBracket: false,
          allowSpectators: true
        }
      });
      tournamentId = tournament.id;
      const entries = await Promise.all(
        [0, 1].map((side) =>
          prisma.dotaTournamentEntry.create({
            data: {
              tournamentId,
              createdByUserId: users[side * 5]!.id,
              teamNameSnapshot: `Team ${side}`,
              teamSlugSnapshot: `${slug}-${side}`,
              members: {
                create: users.slice(side * 5, side * 5 + 5).map((user, index) => ({
                  tournamentId,
                  userId: user.id,
                  displayName: user.displayName,
                  positionRole: String(index + 1),
                  mmr: 3000
                }))
              }
            }
          })
        )
      );
      entryBId = entries[1]!.id;
      const match = await prisma.dotaTournamentMatch.create({
        data: {
          tournamentId,
          entryAId: entries[0]!.id,
          entryBId,
          roundNumber: 1,
          matchNumber: 1,
          createdByUserId: users[0]!.id,
          scheduledAt: new Date(),
          hostSide: "A",
          gameMode: "ALL_PICK",
          serverRegion: "EUROPE",
          allowSpectators: true,
          lobbyDeadlineAt: new Date(Date.now() + 15 * 60_000)
        }
      });
      matchId = match.id;
      await service.submitLobby(
        slug,
        matchId,
        {
          lobbyName: "FDP test lobby",
          lobbyPassword: "test-only-password",
          gameMode: "ALL_PICK",
          serverRegion: "EUROPE",
          allowSpectators: true,
          cheatsEnabled: false
        },
        users[0]!
      );
    });

    afterEach(async () => {
      await prisma.dotaTournament.delete({ where: { id: tournamentId } });
    });
    after(async () => {
      if (users)
        await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
      if (prisma) await prisma.$disconnect();
    });

    const confirm = (user: AuthenticatedUser) =>
      service.confirmLobby(slug, matchId, { playersReady: true }, user);
    const assertStatus = (status: number) => (error: unknown) => {
      assert.equal((error as { getStatus(): number }).getStatus(), status);
      return true;
    };

    it("starts a single durable 120-second window only after both captains confirm", async () => {
      let match = await confirm(users[5]!);
      assert.equal(match.status, "LOBBY_CONFIRMATION");
      assert.ok(match.captainBReadyAt);
      assert.equal(match.captainAReadyAt, null);
      assert.equal(match.spectatorAdmissionEndsAt, null);
      await assert.rejects(service.startMatch(slug, matchId, users[0]!), assertStatus(409));
      const duplicate = await confirm(users[5]!);
      assert.equal(duplicate.captainBReadyAt, match.captainBReadyAt);
      match = await confirm(users[0]!);
      assert.equal(match.status, "SPECTATOR_ADMISSION");
      const persisted = await prisma.dotaTournamentMatch.findUniqueOrThrow({
        where: { id: matchId }
      });
      assert.equal(
        persisted.spectatorAdmissionEndsAt!.getTime() - persisted.settingsConfirmedAt!.getTime(),
        120_000
      );
      assert.equal(
        persisted.confirmationDeadlineAt!.getTime() - persisted.spectatorAdmissionEndsAt!.getTime(),
        15 * 60_000
      );
      assert.equal(persisted.startedAt, null);
      assert.equal(persisted.resultDeadlineAt, null);
      await Promise.all([confirm(users[0]!), confirm(users[5]!)]);
      const repeated = await prisma.dotaTournamentMatch.findUniqueOrThrow({
        where: { id: matchId }
      });
      assert.deepEqual(repeated.spectatorAdmissionEndsAt, persisted.spectatorAdmissionEndsAt);
      const reopened = await service.getParticipantMatch(slug, matchId, users[0]!);
      assert.equal(reopened.spectatorAdmissionEndsAt, match.spectatorAdmissionEndsAt);
    });

    it("serializes simultaneous confirmations without losing either captain", async () => {
      await Promise.all([confirm(users[0]!), confirm(users[5]!), confirm(users[0]!)]);
      const match = await prisma.dotaTournamentMatch.findUniqueOrThrow({ where: { id: matchId } });
      assert.ok(match.captainAReadyAt);
      assert.ok(match.captainBReadyAt);
      assert.equal(match.status, "SPECTATOR_ADMISSION");
      assert.equal(
        match.spectatorAdmissionEndsAt!.getTime() - match.settingsConfirmedAt!.getTime(),
        120_000
      );
    });

    it("rejects noncaptains, outsiders and missing readiness assertions", async () => {
      await assert.rejects(confirm(users[1]!), assertStatus(403));
      await assert.rejects(confirm(users[10]!), assertStatus(403));
      await assert.rejects(
        service.confirmLobby(slug, matchId, { playersReady: false }, users[0]!),
        assertStatus(409)
      );
      const member = await service.getParticipantMatch(slug, matchId, users[1]!);
      assert.equal(member.canConfirmLobby, false);
      assert.equal(member.canManageLobby, false);
      const match = await prisma.dotaTournamentMatch.findUniqueOrThrow({ where: { id: matchId } });
      assert.equal(match.captainAReadyAt, null);
    });

    it("blocks early start on the server and starts the result clock only after admission", async () => {
      await Promise.all([confirm(users[0]!), confirm(users[5]!)]);
      await assert.rejects(service.startMatch(slug, matchId, users[0]!), assertStatus(409));
      await assert.rejects(service.startMatch(slug, matchId, users[1]!), assertStatus(403));
      await assert.rejects(service.startMatch(slug, matchId, users[5]!), assertStatus(403));
      const before = await prisma.dotaTournamentMatch.findUniqueOrThrow({ where: { id: matchId } });
      assert.equal(before.startedAt, null);
      assert.equal(before.resultDeadlineAt, null);
      // Advance the durable timestamp, without waiting two minutes in the test.
      await prisma.dotaTournamentMatch.update({
        where: { id: matchId },
        data: { spectatorAdmissionEndsAt: new Date(Date.now() - 1) }
      });
      const publicMatch = await service.getPublicMatch(slug, matchId);
      assert.equal(publicMatch.status, "READY");
      const started = await service.startMatch(slug, matchId, users[0]!);
      assert.equal(started.status, "IN_PROGRESS");
      const after = await prisma.dotaTournamentMatch.findUniqueOrThrow({ where: { id: matchId } });
      assert.equal(after.resultDeadlineAt!.getTime() - after.startedAt!.getTime(), 4 * 60 * 60_000);
      await assert.rejects(service.startMatch(slug, matchId, users[0]!), assertStatus(409));
    });

    it("requires both captains but skips the wait if spectators are disabled", async () => {
      await prisma.dotaTournamentMatch.update({
        where: { id: matchId },
        data: { allowSpectators: false }
      });
      await confirm(users[0]!);
      const match = await confirm(users[5]!);
      assert.equal(match.status, "READY");
      assert.equal(match.spectatorAdmissionEndsAt, null);
      assert.equal((await service.startMatch(slug, matchId, users[0]!)).status, "IN_PROGRESS");
    });

    it("publishes the countdown but keeps lobby credentials private", async () => {
      await Promise.all([confirm(users[0]!), confirm(users[5]!)]);
      const match = await service.getPublicMatch(slug, matchId, users[10]!);
      assert.equal(match.isParticipant, false);
      assert.ok(match.spectatorAdmissionEndsAt);
      assert.ok(match.serverNow);
      assert.equal("lobbyPassword" in match, false);
      assert.equal("lobbyName" in match, false);
      await assert.rejects(
        service.getParticipantMatch(slug, matchId, users[10]!),
        assertStatus(403)
      );
    });

    it("does not confirm an incomplete lineup or extend an expired preparation deadline", async () => {
      await prisma.dotaTournamentEntryMember.updateMany({
        where: { entryId: entryBId, positionRole: "5" },
        data: { isActive: false }
      });
      await assert.rejects(confirm(users[0]!), assertStatus(409));
      await prisma.dotaTournamentEntryMember.updateMany({
        where: { entryId: entryBId },
        data: { isActive: true }
      });
      await prisma.dotaTournamentMatch.update({
        where: { id: matchId },
        data: { confirmationDeadlineAt: new Date(Date.now() - 1) }
      });
      await assert.rejects(confirm(users[0]!), assertStatus(409));
    });

    it("resets both captain confirmations and spectator admission when replaying a disputed match", async () => {
      await Promise.all([confirm(users[0]!), confirm(users[5]!)]);
      await service.disputeMatch(slug, matchId, { reason: "Lobby settings changed" }, users[5]!);
      await service.resolveAdminMatch(
        matchId,
        { resolution: "REPLAY", note: "Recreate the lobby" },
        { ...users[10]!, role: "ADMIN" }
      );
      const match = await prisma.dotaTournamentMatch.findUniqueOrThrow({ where: { id: matchId } });
      assert.equal(match.status, "SCHEDULED");
      assert.equal(match.captainAReadyAt, null);
      assert.equal(match.captainBReadyAt, null);
      assert.equal(match.spectatorAdmissionEndsAt, null);
      assert.equal(match.lobbyPassword, null);
    });
  }
);
