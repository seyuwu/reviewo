import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type DotaTournamentSoloSearch } from "#prisma/client";
import { DOTA_ATTRIBUTE_KEYS, DOTA_VERTICAL } from "@reviewo/shared";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { PrismaService } from "../../database/prisma.service.js";
import type { DotaProfileService } from "../dota/services/dota-profile.service.js";
import type { GamePartiesService } from "../social/services/game-parties.service.js";
import type { TournamentSoloTicket } from "./dto/tournament-participation.dto.js";
import { DotaTournamentBracketService } from "./tournament-bracket.service.js";
import { TournamentParticipationService } from "./tournament-participation.service.js";
import { DotaTournamentsService } from "./tournaments.service.js";

const connectionString = process.env["TOURNAMENT_ROOMS_TEST_DATABASE_URL"];
const ROLES = ["1", "2", "3", "4", "5"] as const;
type Role = typeof ROLES[number];
type Profile = { entityId: string; title: string; slug: string; roles: Role[]; mmr: string };
const rejectsStatus = (status: number) => (error: unknown) => {
  assert.equal((error as { getStatus(): number }).getStatus(), status);
  return true;
};

describe("Tournament participation (isolated local PostgreSQL)", { skip: !connectionString }, () => {
  let prisma: PrismaClient;
  let profiles: DotaProfileService;
  let tournaments: DotaTournamentsService;
  let participation: TournamentParticipationService;
  let users: AuthenticatedUser[];
  let snapshots: Map<string, Profile>;
  let slug: string;
  let tournamentId: string;

  const makeParticipation = () => new TournamentParticipationService(
    prisma as unknown as PrismaService, profiles, tournaments
  );
  // Exercise a complete persisted worker pass without timers or polling sleeps.
  const processQueue = () => (participation as unknown as {
    process(id: string): Promise<void>;
  }).process(tournamentId);
  const queueRow = (user: AuthenticatedUser) => prisma.dotaTournamentSoloSearch.findUniqueOrThrow({
    where: { tournamentId_userId: { tournamentId, userId: user.id } }
  });
  const notices = (event: "found" | "registered") => prisma.telegramBotNotification.findMany({ where: {
    eventKey: { startsWith: `tournament_participation:${event}:` },
    payload: { path: ["tournamentId"], equals: tournamentId }
  } });
  const seedQueue = (user: AuthenticatedUser, roles: Role[], createdAt = new Date()) =>
    prisma.dotaTournamentSoloSearch.create({ data: { tournamentId, userId: user.id, roles, createdAt } });
  const ticket = (row: DotaTournamentSoloSearch, leaseToken: string): TournamentSoloTicket => ({
    id: row.id, generation: row.generation, leaseToken
  });
  async function claimLease() {
    const leaseToken = randomUUID();
    await prisma.dotaTournament.update({ where: { id: tournamentId }, data: {
      soloMatchLeaseToken: leaseToken, soloMatchLeaseUntil: new Date(Date.now() + 60_000)
    } });
    return leaseToken;
  }
  async function releaseLease() {
    await prisma.dotaTournament.update({ where: { id: tournamentId }, data: {
      soloMatchLeaseToken: null, soloMatchLeaseUntil: null
    } });
  }
  async function createUser(roles: Role[] = [...ROLES]) {
    const user = await prisma.user.create({ data: {
      displayName: "Solo QA " + users.length,
      authIdentities: { create: { provider: "telegram", providerUserId: "solo-qa-" + randomUUID().replaceAll("-", "").slice(0, 20) } }
    } });
    users.push(user);
    const entity = await prisma.entity.create({ data: {
      title: user.displayName, slug: "solo-profile-" + randomUUID(), type: "person", ownerUserId: user.id,
      attributes: { create: [
        { key: DOTA_ATTRIBUTE_KEYS.vertical, value: DOTA_VERTICAL },
        { key: DOTA_ATTRIBUTE_KEYS.roles, value: JSON.stringify(roles) },
        { key: DOTA_ATTRIBUTE_KEYS.mmr, value: "0" }
      ] }
    } });
    snapshots.set(user.id, { entityId: entity.id, title: entity.title, slug: entity.slug, roles, mmr: "0" });
    return user;
  }
  async function setRoles(user: AuthenticatedUser, roles: Role[], refreshSnapshot = true) {
    const profile = snapshots.get(user.id)!;
    await prisma.entityAttribute.update({
      where: { entityId_key: { entityId: profile.entityId, key: DOTA_ATTRIBUTE_KEYS.roles } },
      data: { value: JSON.stringify(roles) }
    });
    if (refreshSnapshot) snapshots.set(user.id, { ...profile, roles });
  }
  async function begin(user: AuthenticatedUser, roles: Role[]) {
    await participation.start(slug, { roles }, user);
    await processQueue();
    return participation.state(slug, user);
  }
  async function createEntry(user: AuthenticatedUser, role: Role, joinMode: "OPEN" | "CONFIRM" = "OPEN") {
    await tournaments.createSquad(slug, { positionRole: role, joinMode }, user);
    return prisma.dotaTournamentEntry.findFirstOrThrow({ where: { tournamentId, createdByUserId: user.id } });
  }

  before(async () => {
    const url = new URL(connectionString!);
    assert.ok(url.hostname === "127.0.0.1" ||
      (url.hostname === "postgres" && process.env["TOURNAMENT_ROOMS_QA_LOCAL_DOCKER"] === "1"),
      "Tests must run against local PostgreSQL");
    assert.equal(url.pathname, "/fdp_rooms_qa", "Only the disposable room QA database is allowed");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
    const db = prisma as unknown as PrismaService;
    profiles = { getMyProfile: async (user: AuthenticatedUser) => {
      const profile = snapshots.get(user.id);
      assert.ok(profile, "A persisted Dota profile fixture is required");
      return { ...profile, roles: [...profile.roles] };
    } } as unknown as DotaProfileService;
    tournaments = new DotaTournamentsService(db, {} as GamePartiesService, profiles,
      new DotaTournamentBracketService(db));
  });
  beforeEach(async () => {
    users = [];
    snapshots = new Map();
    for (let index = 0; index < 4; index++) await createUser();
    slug = "solo-qa-" + randomUUID();
    const tournament = await prisma.dotaTournament.create({ data: {
      slug, title: "Solo QA", status: "REGISTRATION_OPEN", createdByUserId: users[0]!.id
    } });
    tournamentId = tournament.id;
    participation = makeParticipation();
  });
  afterEach(async () => {
    participation?.onModuleDestroy();
    if (tournamentId) {
      await processQueue();
      await prisma.telegramBotNotification.deleteMany({ where: {
        payload: { path: ["tournamentId"], equals: tournamentId }
      } });
      await prisma.dotaTournament.deleteMany({ where: { id: tournamentId } });
    }
    if (users) {
      await prisma.dotaSearchSession.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
      await prisma.entity.deleteMany({ where: { ownerUserId: { in: users.map(user => user.id) } } });
      await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    }
  });
  after(async () => { if (prisma) await prisma.$disconnect(); });

  it("persists a zero-MMR solo search without creating an empty squad", async () => {
    const ordinarySearch = await prisma.dotaSearchSession.create({ data: {
      userId: users[0]!.id, source: "web", expiresAt: new Date(Date.now() + 60_000)
    } });
    const state = await begin(users[0]!, ["1"]);
    assert.equal(state.state, "WAITING");
    assert.deepEqual(state.queueRoles, ["1"]);
    assert.equal((await queueRow(users[0]!)).status, "WAITING");
    assert.equal(await prisma.dotaTournamentEntry.count({ where: { tournamentId } }), 0);
    assert.equal(await prisma.dotaSearchSession.count({ where: { userId: users[0]!.id } }), 1);
    assert.deepEqual(await prisma.dotaSearchSession.findUniqueOrThrow({ where: { id: ordinarySearch.id } }), ordinarySearch);
  });

  it("pairs two compatible players once, with distinct roles and zero-MMR snapshots", async () => {
    await setRoles(users[0]!, ["1", "2"]);
    await setRoles(users[1]!, ["1"]);
    await begin(users[0]!, ["1", "2"]);
    assert.equal((await begin(users[1]!, ["1"])).state, "JOINED");
    const entry = await prisma.dotaTournamentEntry.findFirstOrThrow({
      where: { tournamentId }, include: { members: { where: { isActive: true } } }
    });
    assert.equal(entry.joinMode, "OPEN");
    assert.ok(entry.teamNameSnapshot.length >= 2);
    assert.equal(entry.members.length, 2);
    assert.deepEqual(entry.members.map(member => member.positionRole).sort(), ["1", "2"]);
    assert.ok(entry.members.every(member => member.mmr === 0));
    const found = await notices("found");
    const pairedIdentities = await prisma.userAuthIdentity.findMany({ where: {
      userId: { in: users.slice(0, 2).map(user => user.id) }, provider: "telegram"
    } });
    assert.equal(found.length, 2);
    assert.deepEqual(found.map(notice => notice.telegramUserId).sort(), pairedIdentities.map(identity => identity.providerUserId).sort());
    for (const notice of found) {
      assert.equal((notice.payload as Record<string, unknown>)["type"], "tournament_participation");
      assert.equal((notice.payload as Record<string, unknown>)["event"], "found");
      assert.equal((notice.payload as Record<string, unknown>)["entryId"], entry.id);
      assert.equal(notice.deliveredAt, null);
    }
    for (const user of users.slice(0, 2)) {
      const row = await queueRow(user);
      assert.equal(row.status, "MATCHED");
      assert.equal(row.assignedEntryId, entry.id);
      assert.equal((await begin(user, snapshots.get(user.id)!.roles)).state, "JOINED");
    }
    assert.equal(await prisma.dotaTournamentEntry.count({ where: { tournamentId } }), 1);
    assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { tournamentId, isActive: true } }), 2);
    assert.equal((await notices("found")).length, 2, "Repeated matching must not duplicate notices");
    await tournaments.joinEntry(slug, entry.id, { positionRole: "3" }, users[2]!);
    await tournaments.joinEntry(slug, entry.id, { positionRole: "4" }, users[3]!);
    assert.equal((await notices("registered")).length, 0);
    const finalPlayer = await createUser(["5"]);
    assert.equal((await begin(finalPlayer, ["5"])).entry?.status, "REGISTERED");
    const registered = await notices("registered");
    const memberIdentities = await prisma.userAuthIdentity.findMany({ where: {
      provider: "telegram", user: { status: "active", dotaTournamentEntryMembers: { some: { entryId: entry.id, isActive: true } } }
    } });
    assert.equal(registered.length, 5);
    assert.deepEqual(registered.map(notice => notice.telegramUserId).sort(), memberIdentities.map(identity => identity.providerUserId).sort());
    for (const notice of registered) assert.equal((notice.payload as Record<string, unknown>)["event"], "registered");
    await processQueue();
    assert.equal((await notices("registered")).length, 5);
    assert.equal((await notices("found")).length, 2, "The final player receives the registered notice once");
  });

  it("joins an existing OPEN roster instead of creating another squad", async () => {
    const entry = await createEntry(users[0]!, "1");
    const state = await begin(users[1]!, ["2"]);
    assert.equal(state.state, "JOINED");
    assert.equal(state.entry?.id, entry.id);
    assert.equal(state.entry?.ownRole, "2");
    assert.equal((await queueRow(users[1]!)).assignedEntryId, entry.id);
    assert.equal(await prisma.dotaTournamentEntry.count({ where: { tournamentId } }), 1);
  });

  it("cancels explicitly and rejects assignment using a ticket captured before cancellation", async () => {
    await begin(users[1]!, ["2"]);
    const row = await queueRow(users[1]!);
    const entry = await createEntry(users[0]!, "1");
    const leaseToken = await claimLease();
    assert.equal((await participation.cancel(slug, users[1]!)).state, "NONE");
    const cancelled = await queueRow(users[1]!);
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.generation, row.generation + 1);
    await assert.rejects(tournaments.joinEntry(slug, entry.id, { positionRole: "2" }, users[1]!, ticket(row, leaseToken)), rejectsStatus(409));
    assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { tournamentId, userId: users[1]!.id, isActive: true } }), 0);
  });

  it("fences stale queue generations and positions excluded by the latest queue selection", async () => {
    await begin(users[1]!, ["2"]);
    const old = await queueRow(users[1]!);
    const entry = await createEntry(users[0]!, "1");
    const leaseToken = await claimLease();
    await participation.start(slug, { roles: ["3"] }, users[1]!);
    const current = await queueRow(users[1]!);
    assert.equal(current.generation, old.generation + 1);
    await assert.rejects(tournaments.joinEntry(slug, entry.id, { positionRole: "2" }, users[1]!, ticket(old, leaseToken)), rejectsStatus(409));
    await assert.rejects(tournaments.joinEntry(slug, entry.id, { positionRole: "2" }, users[1]!, ticket(current, leaseToken)), rejectsStatus(409));
    assert.equal((await tournaments.joinEntry(slug, entry.id, { positionRole: "3" }, users[1]!, ticket(current, leaseToken))).result, "JOINED");
  });

  it("rejects expired and replaced worker leases while allowing the current lease", async () => {
    const entry = await createEntry(users[0]!, "1");
    const row = await seedQueue(users[1]!, ["2"]);
    const oldLease = await claimLease();
    await prisma.dotaTournament.update({ where: { id: tournamentId }, data: {
      soloMatchLeaseUntil: new Date(Date.now() - 1000)
    } });
    await assert.rejects(tournaments.joinEntry(slug, entry.id, { positionRole: "2" }, users[1]!, ticket(row, oldLease)), rejectsStatus(409));
    const currentLease = await claimLease();
    await assert.rejects(tournaments.joinEntry(slug, entry.id, { positionRole: "2" }, users[1]!, ticket(row, oldLease)), rejectsStatus(409));
    assert.equal((await tournaments.joinEntry(slug, entry.id, { positionRole: "2" }, users[1]!, ticket(row, currentLease))).result, "JOINED");
  });

  it("rolls back the entire paired squad when the companion ticket is cancelled", async () => {
    const first = await seedQueue(users[0]!, ["1"]);
    const second = await seedQueue(users[1]!, ["2"]);
    const leaseToken = await claimLease();
    await participation.cancel(slug, users[1]!);
    await assert.rejects(tournaments.createSquad(slug, { positionRole: "1" }, users[0]!, ticket(first, leaseToken), {
      user: users[1]!, positionRole: "2", ticket: ticket(second, leaseToken)
    }), rejectsStatus(409));
    assert.equal(await prisma.dotaTournamentEntry.count({ where: { tournamentId } }), 0);
    assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { tournamentId } }), 0);
    assert.equal((await queueRow(users[0]!)).status, "WAITING");
  });

  it("rejects a removed persisted profile role even when the fetched profile snapshot is stale", async () => {
    const entry = await createEntry(users[0]!, "1");
    const row = await seedQueue(users[1]!, ["2"]);
    const leaseToken = await claimLease();
    await setRoles(users[1]!, ["3"], false);
    await assert.rejects(tournaments.joinEntry(slug, entry.id, { positionRole: "2" }, users[1]!, ticket(row, leaseToken)), rejectsStatus(409));
    assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { tournamentId, userId: users[1]!.id } }), 0);
  });

  for (const change of ["unlinked", "inactive"] as const) {
    it(`rejects a ticket after the queued account becomes ${change} and cancels it on recovery`, async () => {
      const entry = await createEntry(users[0]!, "1");
      const row = await seedQueue(users[1]!, ["2"]);
      const leaseToken = await claimLease();
      if (change === "unlinked") await prisma.userAuthIdentity.deleteMany({ where: { userId: users[1]!.id, provider: "telegram" } });
      else await prisma.user.update({ where: { id: users[1]!.id }, data: { status: "blocked" } });
      await assert.rejects(tournaments.joinEntry(slug, entry.id, { positionRole: "2" }, users[1]!, ticket(row, leaseToken)), rejectsStatus(409));
      await releaseLease();
      await processQueue();
      assert.equal((await queueRow(users[1]!)).status, "CANCELLED");
      assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { tournamentId, userId: users[1]!.id } }), 0);
    });
  }

  it("requires a sponsor click for queueing and for both players in an atomic pair", async () => {
    const sponsor = await prisma.dotaTournamentSponsor.create({ data: {
      tournamentId, name: "Local QA sponsor", url: "https://example.com/solo-qa"
    } });
    await assert.rejects(participation.start(slug, { roles: ["1"] }, users[0]!), rejectsStatus(403));
    assert.equal(await prisma.dotaTournamentSoloSearch.count({ where: { tournamentId } }), 0);
    const first = await seedQueue(users[0]!, ["1"]);
    const second = await seedQueue(users[1]!, ["2"]);
    const leaseToken = await claimLease();
    await tournaments.recordSponsorClick(slug, sponsor.id, users[0]!);
    const pair = { user: users[1]!, positionRole: "2" as const, ticket: ticket(second, leaseToken) };
    await assert.rejects(tournaments.createSquad(slug, { positionRole: "1" }, users[0]!, ticket(first, leaseToken), pair), rejectsStatus(403));
    assert.equal(await prisma.dotaTournamentEntry.count({ where: { tournamentId } }), 0);
    assert.equal((await queueRow(users[0]!)).status, "WAITING");
    await tournaments.recordSponsorClick(slug, sponsor.id, users[1]!);
    await tournaments.createSquad(slug, { positionRole: "1" }, users[0]!, ticket(first, leaseToken), pair);
    assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { tournamentId, isActive: true } }), 2);
  });

  it("invalidates solo tickets when a friend request is created and permits explicit withdrawal", async () => {
    await begin(users[1]!, ["2"]);
    const row = await queueRow(users[1]!);
    const friend = await createEntry(users[0]!, "1", "CONFIRM");
    const leaseToken = await claimLease();
    assert.equal((await tournaments.joinEntry(slug, friend.id, { positionRole: "2" }, users[1]!)).result, "REQUESTED");
    assert.equal((await queueRow(users[1]!)).status, "CANCELLED");
    const other = await createEntry(users[2]!, "1");
    await assert.rejects(tournaments.joinEntry(slug, other.id, { positionRole: "2" }, users[1]!, ticket(row, leaseToken)), rejectsStatus(409));
    assert.equal((await participation.cancel(slug, users[1]!)).state, "NONE");
    const request = await prisma.dotaTournamentEntryRequest.findFirstOrThrow({ where: { entryId: friend.id, userId: users[1]!.id } });
    assert.equal(request.status, "WITHDRAWN");
  });

  it("recovers waiting players in a new worker instance using persisted rows", async () => {
    await begin(users[0]!, ["1"]);
    participation.onModuleDestroy();
    participation = makeParticipation();
    assert.equal((await participation.state(slug, users[0]!)).state, "WAITING");
    await seedQueue(users[1]!, ["2"]);
    const competingWorker = makeParticipation();
    await Promise.all([processQueue(), (competingWorker as unknown as {
      process(id: string): Promise<void>;
    }).process(tournamentId)]);
    for (const user of users.slice(0, 2)) assert.equal((await participation.state(slug, user)).state, "JOINED");
    assert.equal(await prisma.dotaTournamentEntry.count({ where: { tournamentId } }), 1);
    assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { tournamentId, isActive: true } }), 2);
  });

  it("continues reserve recruitment after registration closes until the bracket is locked", async () => {
    await prisma.dotaTournament.update({ where: { id: tournamentId }, data: {
      status: "REGISTRATION_CLOSED", registrationClosesAt: new Date(Date.now() - 1000)
    } });
    await begin(users[0]!, ["1"]);
    assert.equal((await begin(users[1]!, ["2"])).entry?.status, "RESERVE");
    assert.equal(await prisma.dotaTournamentEntry.count({ where: { tournamentId, status: "REGISTERED" } }), 0);
  });

  it("expires persisted searches once participation closes and rejects new queue entries", async () => {
    await begin(users[0]!, ["1"]);
    await prisma.dotaTournament.update({ where: { id: tournamentId }, data: { status: "IN_PROGRESS" } });
    await processQueue();
    assert.equal((await queueRow(users[0]!)).status, "EXPIRED");
    assert.equal((await participation.state(slug, users[0]!)).state, "CLOSED");
    await assert.rejects(participation.start(slug, { roles: ["2"] }, users[1]!), rejectsStatus(409));
    const tournament = await prisma.dotaTournament.findUniqueOrThrow({ where: { id: tournamentId } });
    assert.equal(tournament.soloMatchLeaseToken, null);
    assert.equal(tournament.soloMatchLeaseUntil, null);
    assert.equal(await prisma.dotaTournamentEntry.count({ where: { tournamentId } }), 0);
  });

  it("finds a compatible player beyond forty older players queued for the same role", async () => {
    const createdAt = new Date(Date.now() - 60_000);
    for (let index = 0; index < 40; index++) {
      const user = index < users.length ? users[index]! : await createUser(["1"]);
      await seedQueue(user, ["1"], new Date(createdAt.getTime() + index));
    }
    const compatible = await createUser(["2"]);
    await seedQueue(compatible, ["2"]);
    await processQueue();
    assert.equal((await participation.state(slug, compatible)).state, "JOINED");
    const members = await prisma.dotaTournamentEntryMember.findMany({ where: { tournamentId, isActive: true } });
    assert.equal(members.length, 2);
    assert.deepEqual(members.map(member => member.positionRole).sort(), ["1", "2"]);
  });
});
