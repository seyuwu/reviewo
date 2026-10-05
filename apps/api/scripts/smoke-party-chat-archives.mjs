/** Disposable local database only: chat retention must not retain a live roster. */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";
import { GamePartiesRepository } from "../dist/modules/social/repositories/game-parties.repository.js";

const database = new URL(process.env.DATABASE_URL);
const api = process.env.API_BASE_URL;
assert.equal(process.env.NODE_ENV, "development");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
assert.equal(database.pathname, "/fdp_admin_qa");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(api).hostname));
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: database.toString() })
});
const repo = new GamePartiesRepository(prisma);
const prefix = `archive-qa-${Date.now()}`;
const ids = [];
let checks = 0;
function token(id) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: id,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600
    })
  ).toString("base64url");
  return `${header}.${payload}.${createHmac("sha256", process.env.JWT_SECRET).update(`${header}.${payload}`).digest("base64url")}`;
}
async function get(path, actor, expected = 200) {
  const response = await fetch(`${api}${path}`, {
    headers: actor ? { authorization: `Bearer ${token(actor.id)}` } : {},
    signal: AbortSignal.timeout(10000)
  });
  assert.equal(response.status, expected, `${path}: ${response.status}`);
  if (expected === 200) assert.equal(response.headers.get("cache-control"), "private, no-store");
  checks++;
  return response.json();
}
async function room(owner, extra = {}) {
  const id = randomUUID();
  ids.push(id);
  return prisma.gameParty.create({
    data: {
      id,
      ownerUserId: owner.id,
      name: `${prefix}-${ids.length}`,
      slug: `${prefix}-${ids.length}`,
      vertical: "dota",
      kind: "PARTY",
      ...extra
    }
  });
}
async function message(party, owner, text = "hello from archived party") {
  return prisma.gamePartyChatMessage.create({
    data: { partyId: party.id, userId: owner.id, message: text }
  });
}
const users = [];
try {
  for (const role of ["ADMIN", "USER", "TOURNAMENT_MODERATOR"])
    users.push(
      await prisma.user.create({
        data: { displayName: `${prefix}-${"long-name-".repeat(15)}`, role }
      })
    );
  const [admin, user, moderator] = users;
  const party = await room(user);
  await prisma.gamePartyMember.create({
    data: { partyId: party.id, userId: user.id, role: "OWNER", positionRole: "1" }
  });
  await prisma.gamePartyInvite.create({
    data: { partyId: party.id, inviterUserId: user.id, inviteeUserId: admin.id, positionRole: "2" }
  });
  const sent = await message(party, user);
  await prisma.gameParty.delete({ where: { id: party.id } });
  assert.equal(await prisma.gameParty.count({ where: { id: party.id } }), 0);
  assert.equal(await prisma.gamePartyMember.count({ where: { partyId: party.id } }), 0);
  assert.equal(await prisma.gamePartyInvite.count({ where: { partyId: party.id } }), 0);
  assert.equal(await prisma.gamePartyChatMessage.count({ where: { partyId: party.id } }), 0);
  const archive = await prisma.gamePartyChatArchive.findUniqueOrThrow({ where: { id: party.id } });
  assert.equal(archive.expiresAt.getTime() - archive.archivedAt.getTime(), 72 * 3600000);
  const archived = await prisma.gamePartyArchivedChatMessage.findUniqueOrThrow({
    where: { id: sent.id }
  });
  assert.equal(archived.displayName, user.displayName);
  assert.equal(archived.message, sent.message);
  assert.equal(archived.createdAt.toISOString(), sent.createdAt.toISOString());
  console.log(
    "PASS deletion retains only chat snapshots, including long author names, for 72 hours"
  );

  const url = `/admin/parties/archives/${party.id}/messages`;
  await get(url, undefined, 401);
  await get(url, user, 403);
  await get(url, moderator, 403);
  await get("/admin/parties/archives", user, 403);
  await get("/admin/parties/archives", moderator, 403);
  assert.equal((await get(url, admin)).messages[0].id, sent.id);
  assert.ok(
    (await get("/admin/parties/archives", admin)).items.some((item) => item.id === party.id)
  );
  await get(`/admin/parties/${party.id}/chat/messages`, admin, 404);
  await get("/admin/parties/archives?limit=51", admin, 400);
  await get("/admin/parties/archives/not-a-uuid/messages", admin, 400);
  await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
  await get(url, admin, 403);
  await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  console.log("PASS archive permissions, current database role, deleted live chat and validation");

  for (const extra of [
    {},
    { mergedIntoSlug: "retired-into-another-party" },
    { vertical: "other" }
  ]) {
    const skipped = await room(user, extra);
    await message(
      skipped,
      user,
      extra.mergedIntoSlug || extra.vertical
        ? "do not archive this room"
        : "__system__:party_safety"
    );
    await prisma.gameParty.delete({ where: { id: skipped.id } });
    assert.equal(await prisma.gamePartyChatArchive.count({ where: { id: skipped.id } }), 0);
  }
  const empty = await room(user);
  await prisma.gameParty.delete({ where: { id: empty.id } });
  assert.equal(await prisma.gamePartyChatArchive.count({ where: { id: empty.id } }), 0);
  console.log("PASS no empty, system-only, retired merged or unrelated vertical archives");

  const rollback = await room(user);
  await message(rollback, user);
  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await tx.gameParty.delete({ where: { id: rollback.id } });
      throw new Error("forced rollback");
    })
  );
  assert.equal(await prisma.gamePartyChatArchive.count({ where: { id: rollback.id } }), 0);
  assert.equal(await prisma.gamePartyChatMessage.count({ where: { partyId: rollback.id } }), 1);
  console.log("PASS rollback restores live party/chat and leaves no orphan archive");

  const concurrent = await room(user);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let inserted;
  const ready = new Promise((resolve) => {
    inserted = resolve;
  });
  const insertion = prisma.$transaction(async (tx) => {
    await tx.gamePartyChatMessage.create({
      data: {
        partyId: concurrent.id,
        userId: user.id,
        message: "committed immediately before deletion"
      }
    });
    inserted();
    await gate;
  });
  await ready;
  const deletion = prisma.gameParty.delete({ where: { id: concurrent.id } });
  // Start the deletion while the FK lock is held, then let insertion commit.
  const pending = deletion.then(() => "deleted");
  await new Promise((resolve) => setTimeout(resolve, 100));
  release();
  await Promise.all([insertion, pending]);
  assert.equal(
    await prisma.gamePartyArchivedChatMessage.count({ where: { archiveId: concurrent.id } }),
    1
  );
  console.log("PASS a concurrently committed message is retained by deletion");

  // More than one page and identical timestamps require the UUID tie-breaker.
  const stamp = new Date();
  await prisma.gamePartyArchivedChatMessage.createMany({
    data: Array.from({ length: 7 }, (_, n) => ({
      id: randomUUID(),
      archiveId: party.id,
      userId: user.id,
      displayName: user.displayName,
      message: `page-${n}`,
      createdAt: stamp
    }))
  });
  const page1 = await get(`${url}?limit=3`, admin);
  const page2 = await get(`${url}?limit=3&before=${page1.nextCursor}`, admin);
  assert.equal(page1.messages.length, 3);
  assert.equal(page2.messages.length, 3);
  assert.ok(page2.messages.every((m) => !page1.messages.some((first) => first.id === m.id)));
  const otherCursor = await prisma.gamePartyArchivedChatMessage.findFirstOrThrow({
    where: { archiveId: concurrent.id }
  });
  assert.deepEqual((await get(`${url}?before=${otherCursor.id}`, admin)).messages, []);
  const roomsPage1 = await get("/admin/parties/archives?limit=1", admin);
  const roomsPage2 = await get(
    `/admin/parties/archives?limit=1&before=${roomsPage1.nextCursor}`,
    admin
  );
  assert.notEqual(roomsPage1.items[0].id, roomsPage2.items[0].id);
  assert.deepEqual((await get(`/admin/parties/archives?before=${randomUUID()}`, admin)).items, []);
  console.log("PASS chat/list pagination and foreign or missing cursors");

  await prisma.gamePartyChatArchive.update({
    where: { id: party.id },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  await get(url, admin, 404);
  assert.ok(!(await get("/admin/parties/archives", admin)).items.some((a) => a.id === party.id));
  await repo.deleteExpiredPartyChatArchives(new Date());
  assert.equal(await prisma.gamePartyChatArchive.count({ where: { id: party.id } }), 0);
  assert.equal(
    await prisma.gamePartyArchivedChatMessage.count({ where: { archiveId: party.id } }),
    0
  );
  assert.equal(await prisma.gamePartyChatArchive.count({ where: { id: concurrent.id } }), 1);
  const expiredIds = Array.from({ length: 101 }, () => randomUUID());
  ids.push(...expiredIds);
  await prisma.gamePartyChatArchive.createMany({
    data: expiredIds.map((id) => ({ id, name: prefix, expiresAt: new Date(Date.now() - 1000) }))
  });
  const removed = await Promise.all([
    repo.deleteExpiredPartyChatArchives(new Date()),
    repo.deleteExpiredPartyChatArchives(new Date())
  ]);
  assert.ok(removed.every((count) => count <= 100));
  // Another sweep finishes rows skipped because of a concurrent sweep's locks.
  await repo.deleteExpiredPartyChatArchives(new Date());
  assert.equal(await prisma.gamePartyChatArchive.count({ where: { id: { in: expiredIds } } }), 0);
  console.log(
    `PASS expired chats immediately inaccessible, sweep deletes snapshots, fresh archives survive (${checks} HTTP checks)`
  );
} finally {
  await prisma.gameParty.deleteMany({ where: { id: { in: ids } } });
  await prisma.gamePartyChatArchive.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.$disconnect();
}
