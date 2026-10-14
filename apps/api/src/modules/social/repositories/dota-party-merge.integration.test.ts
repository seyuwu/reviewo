import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import { DOTA_ATTRIBUTE_KEYS, DOTA_VERTICAL } from "@reviewo/shared";

import type { PrismaService } from "../../../database/prisma.service.js";
import { planDotaPartyMerge } from "../lib/dota-party-merge.js";
import { GamePartiesRepository } from "./game-parties.repository.js";

const url = process.env["PARTY_MERGE_TEST_DATABASE_URL"];

describe("Recruiting party merge roles (isolated PostgreSQL)", { skip: !url }, () => {
  let prisma: PrismaClient;
  let repository: GamePartiesRepository;
  let userIds: string[];
  let profileIds: string[];
  let partyIds: string[];
  let captains: number[];
  let now: Date;

  before(() => {
    const parsed = new URL(url!);
    assert.ok(parsed.hostname === "127.0.0.1" ||
      (parsed.hostname === "postgres" && process.env["PARTY_MERGE_QA_LOCAL_DOCKER"] === "1"));
    assert.equal(parsed.pathname, "/fdp_rooms_qa");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    repository = new GamePartiesRepository(prisma as unknown as PrismaService);
  });
  beforeEach(() => { userIds = []; profileIds = []; partyIds = []; now = new Date(); });
  afterEach(async () => {
    await prisma.gameParty.deleteMany({ where: { ownerUserId: { in: userIds } } });
    await prisma.entity.deleteMany({ where: { ownerUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });
  after(async () => { await prisma.$disconnect(); });

  async function setup(leftRoles: string[], rightRoles: string[], leftWanted: string[], rightWanted: string[]) {
    for (const role of [...leftRoles, ...rightRoles]) {
      const user = await prisma.user.create({ data: { displayName: "Merge role " + role } });
      userIds.push(user.id);
      const profile = await prisma.entity.create({ data: {
        ownerUserId: user.id, title: user.displayName, slug: "merge-profile-" + randomUUID(), type: "person",
        attributes: { create: [
          { key: DOTA_ATTRIBUTE_KEYS.vertical, value: DOTA_VERTICAL },
          { key: DOTA_ATTRIBUTE_KEYS.mmr, value: "3000" }
        ] }
      } });
      profileIds.push(profile.id);
    }
    captains = [0, leftRoles.length];
    for (const [index, roles] of [leftRoles, rightRoles].entries()) {
      const offset = captains[index]!;
      const party = await prisma.gameParty.create({ data: {
        name: "Merge QA " + index, slug: "merge-role-" + randomUUID(), kind: "PARTY", vertical: "dota",
        ownerUserId: userIds[offset]!, maxMembers: 5, visibility: "PUBLIC", joinMode: "OPEN",
        createdAt: new Date(now.getTime() - 1000 + index), expiresAt: new Date(now.getTime() + 3600000),
        members: { create: roles.map((positionRole, member) => ({
          userId: userIds[offset + member]!, positionRole, role: member === 0 ? "OWNER" : "MEMBER"
        })) }
      } });
      partyIds.push(party.id);
      await prisma.entityAttribute.createMany({ data: [
        { entityId: profileIds[offset]!, key: DOTA_ATTRIBUTE_KEYS.lfgPartySlug, value: party.slug },
        { entityId: profileIds[offset]!, key: DOTA_ATTRIBUTE_KEYS.lfgUntil, value: new Date(now.getTime() + 600000).toISOString() },
        { entityId: profileIds[offset]!, key: DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles, value: (index === 0 ? leftWanted : rightWanted).join(",") }
      ] });
    }
  }

  async function merge(leader = 0) {
    return repository.mergeRecruitingPartiesAtomically({ now, survivorPartyId: partyIds[0]!,
      retiredPartyId: partyIds[1]!, leaderUserId: userIds[captains[leader]!]! });
  }

  async function assertUnchanged(expected: string[][]) {
    for (const [index, id] of partyIds.entries()) {
      const party = await prisma.gameParty.findUniqueOrThrow({ where: { id }, include: { members: true } });
      assert.equal(party.mergedIntoSlug, null);
      assert.equal(party.ownerUserId, userIds[captains[index]!]);
      assert.deepEqual(party.members.map(member => member.positionRole).sort(), [...expected[index]!].sort());
    }
    assert.equal(await prisma.gamePartyChatMessage.count({ where: { partyId: { in: partyIds } } }), 0);
  }

  it("rejects the reported carry versus mid/offlane merge before any database changes", async () => {
    await setup(["1"], ["2", "3"], ["4", "5"], ["1", "4", "5"]);
    const candidates = await repository.listActiveRecruitingParties(now);
    const left = candidates.find(party => party.id === partyIds[0])!;
    const right = candidates.find(party => party.id === partyIds[1])!;
    assert.equal(planDotaPartyMerge(left, right, now), null);
    assert.deepEqual(await merge(), { ok: false, reason: "changed" });
    await assertUnchanged([["1"], ["2", "3"]]);
  });

  it("rejects a one-sided role match inside the locked transaction", async () => {
    await setup(["1"], ["4"], ["4", "5"], ["2", "3"]);
    assert.deepEqual(await merge(), { ok: false, reason: "changed" });
    await assertUnchanged([["1"], ["4"]]);
  });

  it("rechecks changed recruitment roles and preserves only requested remaining roles after a valid merge", async () => {
    await setup(["1"], ["4"], ["4", "5"], ["1", "5"]);
    const candidates = await repository.listActiveRecruitingParties(now);
    const left = candidates.find(party => party.id === partyIds[0])!;
    const right = candidates.find(party => party.id === partyIds[1])!;
    assert.ok(planDotaPartyMerge(left, right, now));
    const where = { entityId_key: { entityId: profileIds[captains[1]!]!, key: DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles } };
    await prisma.entityAttribute.update({ where, data: { value: "2,3" } });
    assert.deepEqual(await merge(), { ok: false, reason: "changed" });
    await assertUnchanged([["1"], ["4"]]);
    await prisma.entityAttribute.update({ where, data: { value: "1,5" } });
    const result = await merge(1);
    assert.equal(result.ok, true);
    const merged = await prisma.gameParty.findUniqueOrThrow({ where: { id: partyIds[0]! }, include: { members: true } });
    assert.equal(merged.ownerUserId, userIds[captains[1]!]);
    assert.deepEqual(merged.members.map(member => member.positionRole).sort(), ["1", "4"]);
    const remaining = (await repository.listActiveRecruitingParties(now)).filter(party => partyIds.includes(party.id));
    assert.equal(remaining.length, 1);
    assert.deepEqual(remaining[0]!.recruitedRoles, ["5"]);
    assert.equal(await prisma.gamePartyChatMessage.count({ where: { partyId: { in: partyIds } } }), 1);
  });

  it("stops recruitment at three members when all selected roles have been filled", async () => {
    await setup(["1"], ["4", "5"], ["4", "5"], ["1"]);
    assert.equal((await merge()).ok, true);
    const merged = await prisma.gameParty.findUniqueOrThrow({ where: { id: partyIds[0]! }, include: { members: true } });
    assert.deepEqual(merged.members.map(member => member.positionRole).sort(), ["1", "4", "5"]);
    assert.equal((await repository.listActiveRecruitingParties(now)).filter(party => partyIds.includes(party.id)).length, 0);
  });
});
