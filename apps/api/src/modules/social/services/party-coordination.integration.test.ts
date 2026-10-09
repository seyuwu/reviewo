import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import { GUARDS_METADATA } from "@nestjs/common/constants.js";

import type { PrismaService } from "../../../database/prisma.service.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { GamePartiesRepository } from "../repositories/game-parties.repository.js";
import { PartiesController } from "../controllers/parties.controller.js";
import { PartyCoordinationService } from "./party-coordination.service.js";

const url = process.env["PARTY_COORDINATION_TEST_DATABASE_URL"];
const status = (expected: number) => (error: unknown) => {
  assert.equal((error as { getStatus(): number }).getStatus(), expected);
  return true;
};

describe("Party coordination (isolated PostgreSQL)", { skip: !url }, () => {
  let prisma: PrismaClient;
  let service: PartyCoordinationService;
  let ids: string[] = [];
  let slug: string;
  let partyId: string;
  let memberships: string[];

  before(async () => {
    const parsed = new URL(url!);
    assert.equal(parsed.hostname, "127.0.0.1");
    assert.equal(parsed.pathname, "/fdp_rooms_qa");
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    const db = prisma as unknown as PrismaService;
    service = new PartyCoordinationService(db, new GamePartiesRepository(db));
  });
  beforeEach(async () => {
    const users = await Promise.all(["Alice", "Bob", "Outsider"].map((displayName) => prisma.user.create({
      data: { displayName, authIdentities: { create: { provider: "telegram", providerUserId: randomUUID(), telegramUsername: displayName.toLowerCase() + "_qa" } } }
    })));
    ids = users.map((user) => user.id);
    slug = "coord-qa-" + randomUUID();
    const party = await prisma.gameParty.create({ data: {
      name: "Coordination QA", slug, ownerUserId: ids[0]!, vertical: "dota", kind: "PARTY",
      expiresAt: new Date(Date.now() + 3600000), members: { create: [
        { userId: ids[0]!, role: "OWNER", positionRole: "1" },
        { userId: ids[1]!, role: "MEMBER", positionRole: "2" }
      ] }
    }, include: { members: true } });
    partyId = party.id;
    memberships = ids.slice(0, 2).map((id) => party.members.find((member) => member.userId === id)!.id);
  });
  afterEach(async () => {
    await prisma.gameParty.deleteMany({ where: { ownerUserId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  });
  after(async () => { await prisma.$disconnect(); });

  it("requires JWT authentication on every private coordination route", () => {
    for (const handler of [PartiesController.prototype.getPartyCoordination, PartiesController.prototype.setPartyReady, PartiesController.prototype.sharePartyTelegramContact]) {
      assert.ok((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]).includes(JwtAuthGuard));
    }
  });

  it("hides unshared peer Telegram contacts and never exposes identity credentials", async () => {
    const view = await service.get(slug, ids[0]!);
    assert.equal(view.members.find((member) => member.isSelf)!.telegramUsername, "alice_qa");
    assert.equal(view.members.find((member) => member.userId === ids[1])!.telegramUsername, null);
    assert.ok(!JSON.stringify(view).includes("providerUserId"));
    await assert.rejects(service.get(slug, ids[2]!), status(403));
  });

  it("shares only the caller's contact in the selected party and supports hiding it", async () => {
    await service.update(slug, ids[0]!, memberships[0]!, { visible: true });
    const peerView = await service.get(slug, ids[1]!);
    assert.equal(peerView.members.find((member) => member.userId === ids[0])!.telegramUsername, "alice_qa");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids[0]! } });
    assert.equal(user.telegramContactVisible, false);
    await service.update(slug, ids[0]!, memberships[0]!, { visible: false });
    assert.equal((await service.get(slug, ids[1]!)).members.find((member) => member.userId === ids[0])!.telegramUsername, null);
  });

  it("never marks another participant ready and preserves positions and capacity", async () => {
    await assert.rejects(service.update(slug, ids[0]!, memberships[1]!, { ready: true }), status(409));
    const confirmed = await service.update(slug, ids[0]!, memberships[0]!, { ready: true });
    assert.ok(confirmed.coordination.members.find((member) => member.isSelf)!.readyAt);
    assert.equal(confirmed.coordination.members.find((member) => member.userId === ids[1])!.readyAt, null);
    assert.deepEqual(confirmed.coordination.members.map((member) => member.positionRole).sort(), ["1", "2"]);
    assert.equal(confirmed.coordination.maxMembers, 5);
    await assert.rejects(service.update(slug, ids[2]!, memberships[0]!, { ready: true }), status(403));
  });

  it("does not share a contact with another party containing the same user", async () => {
    const other = await prisma.gameParty.create({ data: {
      name: "Other coordination QA", slug: "coord-other-" + randomUUID(), ownerUserId: ids[1]!,
      vertical: "dota", kind: "PARTY", expiresAt: new Date(Date.now() + 3600000),
      members: { create: [{ userId: ids[1]!, role: "OWNER" }, { userId: ids[0]!, role: "MEMBER" }] }
    } });
    await service.update(slug, ids[0]!, memberships[0]!, { visible: true });
    const otherView = await service.get(other.slug, ids[1]!);
    assert.equal(otherView.members.find((member) => member.userId === ids[0])!.telegramUsername, null);
  });

  it("keeps repeated confirmation idempotent and allows withdrawing readiness", async () => {
    const first = await service.update(slug, ids[0]!, memberships[0]!, { ready: true });
    const second = await service.update(slug, ids[0]!, memberships[0]!, { ready: true });
    assert.equal(second.changed, false);
    assert.equal(first.coordination.members.find((member) => member.isSelf)!.readyAt, second.coordination.members.find((member) => member.isSelf)!.readyAt);
    const withdrawn = await service.update(slug, ids[0]!, memberships[0]!, { ready: false });
    assert.equal(withdrawn.coordination.members.find((member) => member.isSelf)!.readyAt, null);
  });

  it("rejects old buttons after a participant leaves and rejoins", async () => {
    await prisma.gamePartyMember.delete({ where: { id: memberships[1]! } });
    const replacement = await prisma.gamePartyMember.create({ data: { partyId, userId: ids[1]!, positionRole: "2" } });
    await assert.rejects(service.update(slug, ids[1]!, memberships[1]!, { ready: true }), status(409));
    assert.equal((await prisma.gamePartyMember.findUniqueOrThrow({ where: { id: replacement.id } })).readyAt, null);
  });

  it("rejects reads and changes for expired parties", async () => {
    await prisma.gameParty.update({ where: { id: partyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(service.get(slug, ids[0]!), status(404));
    await assert.rejects(service.update(slug, ids[0]!, memberships[0]!, { visible: true }), status(404));
  });

  it("serializes concurrent confirmation without changing the first ready timestamp", async () => {
    const rows = await Promise.all(Array.from({ length: 4 }, () => service.update(slug, ids[0]!, memberships[0]!, { ready: true })));
    assert.equal(rows.filter((row) => row.changed).length, 1);
    assert.equal(new Set(rows.map((row) => row.coordination.members.find((member) => member.isSelf)!.readyAt)).size, 1);
  });
});
