import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { validate } from "class-validator";
import { DecideDotaTournamentEntryRequestDto } from "./dto/join-dota-tournament-entry.dto.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { PrismaService } from "../../database/prisma.service.js";
import type { DotaProfileService } from "../dota/services/dota-profile.service.js";
import type { GamePartiesService } from "../social/services/game-parties.service.js";
import type { DotaTournamentBracketService } from "./tournament-bracket.service.js";
import {
  companyConfirmed,
  companySnapshotVersion,
  companyRoster,
  companyVersion,
  type CompanyMember
} from "./tournament-company.js";
import { DotaTournamentsService } from "./tournaments.service.js";

const roster = (): CompanyMember[] => [
  { id: "member-1", userId: "user-1", positionRole: "1", companyConsentVersion: null },
  { id: "member-2", userId: "user-2", positionRole: "2", companyConsentVersion: null }
];

function confirm(members: CompanyMember[]) {
  const version = companyVersion(members);
  for (const member of members) member.companyConsentVersion = version;
  return version;
}

describe("Tournament company consent", () => {
  it("binds consent to every membership, player and position independently of query order", () => {
    const members = roster();
    const version = confirm(members);
    assert.equal(companyConfirmed(members), true);
    assert.equal(companyVersion([...members].reverse()), version);
    assert.equal(companySnapshotVersion(companyRoster(members)), version);
    for (const field of ["id", "userId", "positionRole"] as const) {
      const changed = members.map((member) => ({ ...member }));
      changed[0]![field] = field === "positionRole" ? "5" : "replacement";
      assert.equal(companyConfirmed(changed), false);
    }
    assert.equal(
      companyConfirmed([...members, { id: "member-3", userId: "user-3", positionRole: "3" }]),
      false
    );
  });

  it("requires all two to four players to consent with distinct valid positions", () => {
    const members = roster();
    confirm(members);
    assert.equal(companyConfirmed(members.slice(0, 1)), false);
    members[1]!.companyConsentVersion = null;
    assert.equal(companyConfirmed(members), false);
    for (const role of ["1", "6", null]) {
      members[1]!.positionRole = role;
      confirm(members);
      assert.equal(companyConfirmed(members), false);
    }
    members[1]!.positionRole = "2";
    members[1]!.userId = null;
    confirm(members);
    assert.equal(companyConfirmed(members), false);
    assert.equal(companySnapshotVersion({}), null);
    assert.equal(
      companySnapshotVersion([{ membershipId: "x", userId: "u", positionRole: "6" }]),
      null
    );
  });

  it("does not restore previous consent when a player changes a position and changes back", async () => {
    const members = roster().map((member) => ({ ...member, isActive: true }));
    confirm(members);
    const tournament = {
      id: "cup",
      status: "REGISTRATION_OPEN",
      registrationClosesAt: null,
      maxTeams: null
    };
    const entry = {
      id: "entry",
      companySearchEnabled: true,
      status: "RECRUITING",
      createdByUserId: "user-1",
      teamParty: null,
      tournament
    };
    const db = {
      $executeRaw: async () => 0,
      dotaTournamentEntry: {
        findFirst: async () => entry,
        findUnique: async () => entry,
        updateMany: async () => ({ count: 1 })
      },
      dotaTournamentEntryMember: {
        findUnique: async ({ where }: { where: { entryId_userId: { userId: string } } }) =>
          members.find((member) => member.userId === where.entryId_userId.userId),
        findFirst: async ({
          where
        }: {
          where: { positionRole: string; userId: { not: string } };
        }) =>
          members.find(
            (member) =>
              member.positionRole === where.positionRole && member.userId !== where.userId.not
          ),
        findMany: async () => members,
        update: async ({
          where,
          data
        }: {
          where: { id: string };
          data: { positionRole: string };
        }) => {
          const member = members.find((member) => member.id === where.id)!;
          Object.assign(member, data);
          return member;
        },
        updateMany: async ({ data }: { data: { companyConsentVersion: null } }) => {
          for (const member of members) Object.assign(member, data);
          return { count: members.length };
        }
      }
    };
    const prisma = {
      ...db,
      $transaction: async (work: (tx: typeof db) => Promise<unknown>) => work(db)
    };
    const service = new DotaTournamentsService(
      prisma as unknown as PrismaService,
      {} as GamePartiesService,
      { getMyProfile: async () => ({}) } as unknown as DotaProfileService,
      {} as DotaTournamentBracketService
    );
    mock.method(service, "getPublic", async () => ({}));
    const user = { id: "user-2" } as AuthenticatedUser;
    await service.assignEntryPosition("cup", "entry", "2", user);
    assert.equal(companyConfirmed(members), true, "Saving the same position preserves current consent");
    await service.assignEntryPosition("cup", "entry", "4", user);
    assert.equal(companyConfirmed(members), false);
    await service.assignEntryPosition("cup", "entry", "2", user);
    assert.equal(
      companyConfirmed(members),
      false,
      "Returning to the same roster must not revive old consent"
    );
    assert.ok(members.every((member) => member.companyConsentVersion === null));
  });
});


describe("Tournament company admission guards", () => {
  const user = { id: "user-1" } as AuthenticatedUser;
  const tournament = { id: "cup", status: "REGISTRATION_OPEN", registrationClosesAt: null };
  const rejectsConflict = (error: unknown) => {
    assert.equal((error as { getStatus(): number }).getStatus(), 409);
    return true;
  };

  it("rejects automatic matching if an OPEN squad became a company or changed its join policy", async () => {
    for (const changed of [{ joinMode: "OPEN", companySearchEnabled: true }, { joinMode: "CONFIRM", companySearchEnabled: false }]) {
      const entry = { id: "entry", status: "RECRUITING", joinMode: "OPEN", companySearchEnabled: false, tournament };
      const tx = { $executeRaw: async () => 0, dotaTournamentEntry: { findFirst: async () => ({ ...entry, ...changed }) } };
      const prisma = { dotaTournamentEntry: { findFirst: async () => entry },
        $transaction: async (work: (db: typeof tx) => Promise<unknown>) => work(tx) };
      const service = new DotaTournamentsService(prisma as unknown as PrismaService, {} as GamePartiesService,
        { getMyProfile: async () => ({ title: "Player", slug: "player", mmr: "0" }) } as unknown as DotaProfileService,
        {} as DotaTournamentBracketService);
      await assert.rejects(service.joinEntry("cup", "entry", { positionRole: "2" }, user,
        { id: "queue", generation: 1, leaseToken: "lease" }), rejectsConflict);
    }
  });

  it("validates website application timestamp and position together", async () => {
    const input = new DecideDotaTournamentEntryRequestDto();
    input.decision = "ACCEPT";
    assert.equal((await validate(input)).length, 0);
    input.requestUpdatedAt = "2026-10-13T12:00:00.000Z";
    assert.ok((await validate(input)).some(error => error.property === "positionRole"));
    input.positionRole = "2";
    assert.equal((await validate(input)).length, 0);
    delete input.requestUpdatedAt;
    assert.ok((await validate(input)).some(error => error.property === "requestUpdatedAt"));
  });

  it("rejects a website decision for a replaced company application before changing the roster", async () => {
    let transactions = 0;
    const entry = { id: "entry", createdByUserId: user.id, teamParty: null, tournament };
    const request = { id: "request", sourceEntryId: "company", positionRole: "2", updatedAt: new Date("2026-10-13T12:00:00.000Z") };
    const prisma = { dotaTournamentEntry: { findFirst: async () => entry }, dotaTournamentEntryRequest: { findFirst: async () => request },
      $transaction: async () => { transactions++; } };
    const service = new DotaTournamentsService(prisma as unknown as PrismaService, {} as GamePartiesService,
      {} as DotaProfileService, {} as DotaTournamentBracketService);
    await assert.rejects(service.decideJoinRequest("cup", "entry", "request", "ACCEPT", user, undefined,
      { updatedAt: "2026-10-12T12:00:00.000Z", positionRole: "2" }), rejectsConflict);
    assert.equal(transactions, 0);
  });
});
