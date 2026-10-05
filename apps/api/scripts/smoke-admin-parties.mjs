/** Local-only regression: administrator observation must not affect party matchmaking. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";
import { GamePartiesRepository } from "../dist/modules/social/repositories/game-parties.repository.js";

const api = process.env.API_BASE_URL ?? "http://127.0.0.1:32107";
const database = new URL(process.env.DATABASE_URL);
assert.equal(process.env.NODE_ENV, "development");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(api).hostname));
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
assert.equal(database.pathname, "/fdp_admin_qa", "Use a disposable QA database only");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: database.toString() })
});
const { io } = createRequire(new URL("../../web/package.json", import.meta.url))(
  "socket.io-client"
);
const prefix = `admin-party-qa-${Date.now()}`;
const users = [];
const sockets = [];
const timings = [];
const { AbortSignal } = globalThis;
let assertions = 0;

function token(userId) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat: now, exp: now + 3600 })).toString(
    "base64url"
  );
  return `${header}.${payload}.${createHmac("sha256", process.env.JWT_SECRET).update(`${header}.${payload}`).digest("base64url")}`;
}

async function request(path, actor, method = "GET", body, expected = 200) {
  const started = performance.now();
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(actor ? { Authorization: `Bearer ${actor.token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json();
  timings.push(performance.now() - started);
  assert.ok(
    (Array.isArray(expected) ? expected : [expected]).includes(response.status),
    `${method} ${path}: ${response.status} ${JSON.stringify(result)}`
  );
  assertions++;
  return { result, status: response.status, headers: response.headers };
}

async function player(label, role = "USER", mmr = "3500") {
  const user = await prisma.user.create({ data: { displayName: `${prefix}-${label}`, role } });
  const actor = { ...user, token: token(user.id) };
  users.push(actor);
  const { result } = await request(
    "/dota/profiles",
    actor,
    "POST",
    {
      title: actor.displayName,
      roles: ["1", "2", "3", "4", "5"],
      mmr,
      matchMode: "auto"
    },
    201
  );
  actor.profileSlug = result.slug;
  return actor;
}

async function party(captain, position = "1", kind = "PARTY") {
  const { result } = await request(
    "/social/parties",
    captain,
    "POST",
    { kind, name: `${prefix}-${captain.id.slice(0, 6)}` },
    201
  );
  await request(`/social/parties/${result.slug}/members/me/position`, captain, "PATCH", {
    positionRole: position
  });
  return result;
}

async function snapshot(partyId) {
  return {
    party: await prisma.gameParty.findUnique({ where: { id: partyId } }),
    members: await prisma.gamePartyMember.findMany({ where: { partyId }, orderBy: { id: "asc" } }),
    messages: await prisma.gamePartyChatMessage.findMany({
      where: { partyId },
      orderBy: { id: "asc" }
    }),
    invites: await prisma.gamePartyInvite.findMany({ where: { partyId }, orderBy: { id: "asc" } })
  };
}

async function connect(actor) {
  const socket = io(`${api}/parties`, {
    auth: { token: actor.token },
    transports: ["websocket"],
    extraHeaders: { Origin: "http://localhost:3001" }
  });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket connection timeout")), 6000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return socket;
}

function ack(socket, event, payload) {
  return new Promise((resolve, reject) =>
    socket
      .timeout(6000)
      .emit(event, payload, (error, result) => (error ? reject(error) : resolve(result)))
  );
}

function event(socket, name, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, handler);
      reject(new Error(`Missing ${name} event`));
    }, 6000);
    function handler(value) {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(name, handler);
      resolve(value);
    }
    socket.on(name, handler);
  });
}

const pass = (label) => console.log(`PASS ${label}`);
try {
  const admin = await player("observer", "ADMIN");
  const moderator = await player("moderator", "TOURNAMENT_MODERATOR");
  const captain = await player("captain");
  const a = await player("player-a");
  const b = await player("player-b");
  const c = await player("player-c");
  const d = await player("player-d");
  const e = await player("player-e");
  await request("/admin/games/launch", admin, "PATCH", { searchLive: true });
  const roster = await party(captain);
  await request(
    `/social/parties/${roster.slug}/messages`,
    captain,
    "POST",
    { message: "QA message before recruitment" },
    201
  );
  await request(
    `/social/parties/${roster.slug}/messages`,
    captain,
    "POST",
    { message: "QA second message" },
    201
  );
  await prisma.gameParty.update({ where: { id: roster.id }, data: { visibility: "PRIVATE" } });

  await request("/admin/parties", null, "GET", undefined, 401);
  await request("/admin/parties", a, "GET", undefined, 403);
  await request("/admin/parties", moderator, "GET", undefined, 403);
  await request(`/admin/parties/${roster.id}/chat/messages`, a, "GET", undefined, 403);
  await request(`/admin/parties/${roster.id}/chat/messages`, moderator, "GET", undefined, 403);
  await request(`/social/parties/${roster.slug}/messages`, a, "GET", undefined, 403);
  await request(
    `/social/parties/${roster.slug}/messages`,
    admin,
    "POST",
    { message: "Observer cannot write" },
    403
  );
  await request("/admin/parties?limit=99999", admin, "GET", undefined, 400);
  await request("/admin/parties?kind=ADMIN", admin, "GET", undefined, 400);
  await request("/admin/parties?before=invalid", admin, "GET", undefined, 400);
  await request("/admin/parties/not-a-uuid/chat/messages", admin, "GET", undefined, 400);
  pass(
    "anonymous, ordinary user and moderator cannot read admin data; observer cannot send messages; invalid inputs rejected"
  );

  const beforeRead = await snapshot(roster.id);
  const page = await request("/admin/parties?limit=1", admin);
  assert.equal(page.result.items[0].id, roster.id);
  assert.equal(page.result.items[0].visibility, "PRIVATE");
  assert.equal(page.headers.get("cache-control"), "private, no-store");
  const chat = await request(`/admin/parties/${roster.id}/chat/messages?limit=2`, admin);
  assert.deepEqual(
    chat.result.messages.map((m) => m.message),
    ["QA message before recruitment", "QA second message"]
  );
  const older = await request(
    `/admin/parties/${roster.id}/chat/messages?before=${chat.result.nextCursor}&limit=2`,
    admin
  );
  assert.ok(older.result.messages.some((m) => m.message === "__system__:party_safety"));
  assert.equal(chat.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await snapshot(roster.id), beforeRead);
  assert.equal(
    await prisma.gamePartyMember.count({ where: { partyId: roster.id, userId: admin.id } }),
    0
  );
  await prisma.gamePartyChatMessage.deleteMany({
    where: { partyId: roster.id, message: "__system__:party_safety" }
  });
  const withoutSafetyTip = await snapshot(roster.id);
  await request(`/admin/parties/${roster.id}/chat/messages`, admin);
  assert.deepEqual(await snapshot(roster.id), withoutSafetyTip);
  pass(
    "reading private party and paginated chat preserves roster, roles, invitations, messages and party timestamps"
  );

  await prisma.user.update({ where: { id: admin.id }, data: { role: "USER" } });
  await request(`/admin/parties/${roster.id}/chat/messages`, admin, "GET", undefined, 403);
  await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  pass("revoking ADMIN blocks the same existing access token immediately");

  await prisma.gameParty.update({ where: { id: roster.id }, data: { visibility: "PUBLIC" } });
  await request(
    "/dota/profiles/lfg/looking",
    captain,
    "POST",
    { looking: true, source: "web", partySlug: roster.slug, recruitedRoles: ["2", "3", "4", "5"] },
    201
  );
  const listing = (await request("/dota/profiles/lfg?roles=2", a)).result.results;
  assert.ok(
    listing.some((hit) => hit.partySlug === roster.slug && hit.recruitedRoles.includes("2"))
  );
  const race = await Promise.all(
    [a, b].map((actor) =>
      request(
        "/social/parties/stack",
        actor,
        "POST",
        { targetSlug: captain.profileSlug, positionRole: "2", source: "web" },
        [201, 409]
      )
    )
  );
  assert.equal(race.filter((item) => item.status === 201).length, 1);
  const winner = race[0].status === 201 ? a : b;
  const loser = winner === a ? b : a;
  const joined = (await request(`/social/parties/${roster.slug}`, captain)).result;
  assert.equal(joined.memberCount, 2);
  assert.equal(joined.members.filter((member) => member.positionRole === "2").length, 1);
  assert.equal(joined.members.find((member) => member.userId === winner.id).positionRole, "2");
  assert.ok(!joined.recruitedRoles.includes("2"));
  await request(`/admin/parties/${roster.id}/chat/messages`, admin);
  await request(
    `/social/parties/${roster.slug}/members/me/position`,
    winner,
    "PATCH",
    { positionRole: "1" },
    409
  );
  await request(`/social/parties/${roster.slug}/members/me/position`, winner, "PATCH", {
    positionRole: "3"
  });
  let refreshed = (await request(`/social/parties/${roster.slug}`, captain)).result;
  assert.ok(refreshed.recruitedRoles.includes("2"));
  assert.ok(!refreshed.recruitedRoles.includes("3"));
  const beforeConcurrentRead = await snapshot(roster.id);
  await Promise.all(
    Array.from({ length: 8 }, () => request(`/admin/parties/${roster.id}/chat/messages`, admin))
  );
  assert.deepEqual(await snapshot(roster.id), beforeConcurrentRead);
  await request(`/social/parties/${roster.slug}/members/me`, winner, "DELETE");
  refreshed = (await request(`/social/parties/${roster.slug}`, captain)).result;
  assert.equal(refreshed.memberCount, 1);
  assert.ok(refreshed.recruitedRoles.includes("3"));
  pass(
    "one winner per contested slot; occupied roles rejected; changing or leaving a slot restores recruitment; concurrent admin reads are harmless"
  );

  const sharedLink = (
    await request(`/social/parties/${roster.slug}/join-token`, captain, "POST", {}, 201)
  ).result.token;
  const mateSocket = await connect(loser);
  const rosterSocket = await connect(captain);
  await ack(rosterSocket, "watch", { partySlug: roster.slug });
  const update = event(rosterSocket, "party_updated", (value) =>
    value.members.some((member) => member.userId === loser.id && member.positionRole === "2")
  );
  await request(
    "/social/parties/join",
    loser,
    "POST",
    { token: sharedLink, positionRole: "2" },
    201
  );
  await update;
  const room = await ack(mateSocket, "join", { partySlug: roster.slug });
  assert.equal(room.party.id, roster.id);
  const message = event(
    mateSocket,
    "new_message",
    (value) => value.message === "QA member chat still works"
  );
  await request(
    `/social/parties/${roster.slug}/messages`,
    captain,
    "POST",
    { message: "QA member chat still works" },
    201
  );
  await message;
  pass("invitation links, realtime roster updates and member chat delivery still work");

  for (const [actor, role] of [
    [c, "3"],
    [d, "4"],
    [e, "5"]
  ]) {
    await request(
      "/social/parties/join",
      actor,
      "POST",
      { token: sharedLink, positionRole: role },
      201
    );
  }
  const full = (await request(`/social/parties/${roster.slug}`, captain)).result;
  assert.equal(full.memberCount, 5);
  assert.equal(full.openSlots, 0);
  assert.deepEqual(full.recruitedRoles, []);
  await request(
    "/social/parties/join",
    winner,
    "POST",
    { token: sharedLink, positionRole: "2" },
    409
  );
  pass("five-slot capacity and duplicate-slot protection survive admin observation");

  const applyCaptain = await player("apply-captain");
  const applicant = await player("applicant");
  const applicationParty = await party(applyCaptain);
  await request(`/social/parties/${applicationParty.slug}/join-mode`, applyCaptain, "PATCH", {
    joinMode: "CONFIRM"
  });
  await request(
    "/dota/profiles/lfg/looking",
    applyCaptain,
    "POST",
    { looking: true, partySlug: applicationParty.slug, recruitedRoles: ["2"] },
    201
  );
  const application = (
    await request(
      "/social/parties/stack",
      applicant,
      "POST",
      { targetSlug: applyCaptain.profileSlug, positionRole: "2" },
      201
    )
  ).result;
  assert.equal(application.invite.status, "PENDING");
  assert.equal(
    (await request(`/social/parties/${applicationParty.slug}`, applyCaptain)).result.memberCount,
    1
  );
  await request(`/admin/parties/${applicationParty.id}/chat/messages`, admin);
  await request(
    `/social/parties/invites/${application.invite.id}/accept`,
    applyCaptain,
    "POST",
    {},
    201
  );
  assert.equal(
    (await request(`/social/parties/${applicationParty.slug}`, applyCaptain)).result.memberCount,
    2
  );
  pass("application requires captain approval and reserves the chosen role on acceptance");

  // Voluntary leave persists across new searches, but allows an explicit return.
  await request(`/social/parties/${applicationParty.slug}/members/me`, applicant, "DELETE");
  await request(
    "/dota/profiles/lfg/looking",
    applyCaptain,
    "POST",
    {
      looking: true,
      partySlug: applicationParty.slug,
      recruitedRoles: ["2", "3", "4", "5"]
    },
    201
  );
  let block = await prisma.gamePartyJoinBlock.findUnique({
    where: { partyId_userId: { partyId: applicationParty.id, userId: applicant.id } }
  });
  assert.equal(block.allowManualRejoin, true);
  for (const source of ["web", "telegram"]) {
    await request("/dota/profiles/lfg/looking", applicant, "POST", { looking: true, source }, 201);
    await request(
      "/social/parties/stack",
      applicant,
      "POST",
      {
        targetSlug: applyCaptain.profileSlug,
        positionRole: "2",
        source,
        manualJoin: false
      },
      403
    );
    await request("/dota/profiles/lfg/looking", applicant, "POST", { looking: false }, 201);
  }
  const manualApplication = (
    await request(
      "/social/parties/stack",
      applicant,
      "POST",
      {
        targetSlug: applyCaptain.profileSlug,
        positionRole: "2",
        manualJoin: true
      },
      201
    )
  ).result;
  assert.equal(manualApplication.invite.status, "PENDING");
  await request(
    `/social/parties/invites/${manualApplication.invite.id}/accept`,
    applyCaptain,
    "POST",
    {},
    201
  );
  await request(`/social/parties/${applicationParty.slug}/members/me`, applicant, "DELETE");
  await request(`/social/parties/${applicationParty.slug}/join-mode`, applyCaptain, "PATCH", {
    joinMode: "OPEN"
  });
  await request(
    `/social/parties/${applicationParty.slug}/claim`,
    applicant,
    "POST",
    { positionRole: "2" },
    201
  );
  await request(`/social/parties/${applicationParty.slug}/members/me`, applicant, "DELETE");
  await request(
    "/social/parties/stack",
    applicant,
    "POST",
    {
      targetSlug: applyCaptain.profileSlug,
      positionRole: "2"
    },
    403
  ); // Old automatic clients omit manualJoin and remain blocked.
  await request(
    "/social/parties/stack",
    applicant,
    "POST",
    {
      targetSlug: applyCaptain.profileSlug,
      positionRole: "2",
      manualJoin: true
    },
    201
  );
  await request(`/social/parties/${applicationParty.slug}/members/me`, applicant, "DELETE");
  const returnLink = (
    await request(
      `/social/parties/${applicationParty.slug}/join-token`,
      applyCaptain,
      "POST",
      {},
      201
    )
  ).result.token;
  await request(
    "/social/parties/join",
    applicant,
    "POST",
    { token: returnLink, positionRole: "2" },
    201
  );
  await request(
    `/social/parties/${applicationParty.slug}/members/${applicant.id}`,
    applyCaptain,
    "DELETE"
  );
  block = await prisma.gamePartyJoinBlock.findUnique({
    where: { partyId_userId: { partyId: applicationParty.id, userId: applicant.id } }
  });
  assert.equal(block.allowManualRejoin, false);
  await request(
    `/social/parties/${applicationParty.slug}/claim`,
    applicant,
    "POST",
    { positionRole: "2" },
    403
  );
  await request(
    "/social/parties/stack",
    applicant,
    "POST",
    {
      targetSlug: applyCaptain.profileSlug,
      positionRole: "2",
      manualJoin: true
    },
    403
  );
  await request("/dota/profiles/lfg/looking", applicant, "POST", { looking: true }, 201);
  await request(
    "/social/parties/stack",
    applyCaptain,
    "POST",
    {
      targetSlug: applicant.profileSlug,
      partySlug: applicationParty.slug,
      positionRole: "2",
      manualJoin: false
    },
    403
  );
  const directInvite = (
    await request(
      "/social/parties/stack",
      applyCaptain,
      "POST",
      {
        targetSlug: applicant.profileSlug,
        partySlug: applicationParty.slug,
        positionRole: "2",
        manualJoin: true
      },
      201
    )
  ).result.invite;
  await request(`/social/parties/invites/${directInvite.id}/accept`, applicant, "POST", {}, 201);
  await request(`/social/parties/${applicationParty.slug}/members/me`, applicant, "DELETE");
  assert.equal(
    (
      await prisma.gamePartyJoinBlock.findUnique({
        where: { partyId_userId: { partyId: applicationParty.id, userId: applicant.id } }
      })
    ).allowManualRejoin,
    true
  );
  await request(
    "/dota/profiles/lfg/looking",
    applyCaptain,
    "POST",
    { looking: false, partySlug: applicationParty.slug },
    201
  );
  pass(
    "leave survives search restarts on website/Telegram; manual role, application, link and invitation work; kicks remain restricted"
  );

  const soloWeb = await player("solo-web");
  const soloBot = await player("solo-bot");
  await request(
    "/dota/profiles/lfg/looking",
    soloWeb,
    "POST",
    { looking: true, source: "web" },
    201
  );
  await request(
    "/dota/profiles/lfg/looking",
    soloBot,
    "POST",
    { looking: true, source: "telegram" },
    201
  );
  await request("/admin/parties", admin);
  const matched = (
    await request(
      "/social/parties/auto-match/solo-group/web",
      soloWeb,
      "POST",
      {
        members: [
          { userId: soloWeb.id, positionRole: "4" },
          { userId: soloBot.id, positionRole: "5" }
        ]
      },
      201
    )
  ).result;
  assert.equal(matched.memberCount, 2);
  assert.deepEqual(matched.recruitedRoles, ["1", "2", "3"]);
  assert.equal(matched.members.find((member) => member.userId === soloWeb.id).positionRole, "4");
  assert.equal(matched.members.find((member) => member.userId === soloBot.id).positionRole, "5");
  await request(
    "/social/parties/auto-match/solo-group/web",
    soloWeb,
    "POST",
    {
      members: [
        { userId: soloWeb.id, positionRole: "4" },
        { userId: soloBot.id, positionRole: "5" }
      ]
    },
    409
  );
  await request(
    "/dota/profiles/lfg/looking",
    matched.ownerUserId === soloWeb.id ? soloWeb : soloBot,
    "POST",
    { looking: false, partySlug: matched.slug },
    201
  );
  pass(
    "mixed website/Telegram auto-group assigns distinct roles; duplicate grouping rejected; search can be stopped"
  );

  const high = await player("high-mmr", "USER", "6500");
  const low = await player("low-mmr", "USER", "2500");
  for (const actor of [high, low])
    await request("/dota/profiles/lfg/looking", actor, "POST", { looking: true }, 201);
  await request(
    "/social/parties/auto-match/solo-group/web",
    low,
    "POST",
    {
      members: [
        { userId: low.id, positionRole: "1" },
        { userId: high.id, positionRole: "2" }
      ]
    },
    409
  );
  assert.equal(
    await prisma.gamePartyMember.count({ where: { userId: { in: [high.id, low.id] } } }),
    0
  );
  for (const actor of [high, low])
    await request("/dota/profiles/lfg/looking", actor, "POST", { looking: false }, 201);
  pass("incompatible MMR group rejected without occupying slots or creating memberships");

  const mergeA = await player("merge-a");
  const mergeB = await player("merge-b");
  const left = await party(mergeA, "1");
  const right = await party(mergeB, "2");
  await prisma.gamePartyJoinBlock.create({
    data: { partyId: left.id, userId: mergeB.id, allowManualRejoin: true }
  });
  await prisma.gamePartyJoinBlock.create({
    data: { partyId: right.id, userId: applicant.id, allowManualRejoin: true }
  });
  await request(
    "/dota/profiles/lfg/looking",
    mergeA,
    "POST",
    { looking: true, partySlug: left.slug, recruitedRoles: ["2", "3", "4", "5"] },
    201
  );
  await request(
    "/dota/profiles/lfg/looking",
    mergeB,
    "POST",
    {
      looking: true,
      source: "telegram",
      partySlug: right.slug,
      recruitedRoles: ["1", "3", "4", "5"]
    },
    201
  );
  let merged;
  const repository = new GamePartiesRepository(prisma);
  const blockedMerge = await repository.mergeRecruitingPartiesAtomically({
    leaderUserId: mergeA.id,
    now: new Date(),
    retiredPartyId: right.id,
    survivorPartyId: left.id
  });
  assert.equal(blockedMerge.ok, false);
  assert.equal(
    (
      await prisma.gamePartyMember.findMany({
        where: { userId: { in: [mergeA.id, mergeB.id] } }
      })
    ).length,
    2
  );
  assert.equal(
    await prisma.gameParty.count({
      where: { id: { in: [left.id, right.id] }, mergedIntoSlug: null }
    }),
    2
  );
  await prisma.gamePartyJoinBlock.delete({
    where: { partyId_userId: { partyId: left.id, userId: mergeB.id } }
  });
  pass(
    "transaction rejects a merge that would return an excluded player, even with a stale matchmaking plan"
  );
  for (let attempt = 0; attempt < 24; attempt++) {
    await request("/admin/parties", admin);
    merged = await prisma.gamePartyMember.findMany({
      where: { userId: { in: [mergeA.id, mergeB.id] } }
    });
    if (merged.length === 2 && merged[0].partyId === merged[1].partyId) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(merged.length, 2);
  assert.equal(merged[0].partyId, merged[1].partyId);
  assert.equal(new Set(merged.map((member) => member.positionRole)).size, 2);
  const survivor = await prisma.gameParty.findUnique({ where: { id: merged[0].partyId } });
  assert.deepEqual(
    (await request(`/social/parties/${survivor.slug}`, admin)).result.recruitedRoles,
    ["3", "4", "5"]
  );
  const finalList = (await request("/admin/parties", admin)).result.items;
  assert.ok(finalList.some((item) => item.id === survivor.id));
  assert.ok(!finalList.some((item) => item.id === (survivor.id === left.id ? right.id : left.id)));
  const carriedBlock = await prisma.gamePartyJoinBlock.findUnique({
    where: { partyId_userId: { partyId: survivor.id, userId: applicant.id } }
  });
  assert.equal(carriedBlock.allowManualRejoin, true);
  const mergeCaptain = survivor.ownerUserId === mergeA.id ? mergeA : mergeB;
  await request(
    "/social/parties/stack",
    applicant,
    "POST",
    {
      targetSlug: mergeCaptain.profileSlug,
      positionRole: "3",
      manualJoin: false
    },
    403
  );
  await request(
    `/social/parties/${survivor.slug}/claim`,
    applicant,
    "POST",
    { positionRole: "3" },
    201
  );
  await request(`/social/parties/${survivor.slug}/members/me`, applicant, "DELETE");
  pass(
    "website/Telegram parties still merge, preserve roles and exclude the retired roster from the admin list"
  );

  const expiredOwner = await player("expired-owner");
  const team = await party(admin, "3", "TEAM");
  const teamList = (await request("/admin/parties?kind=TEAM", admin)).result;
  assert.ok(teamList.items.some((item) => item.id === team.id));
  assert.ok(teamList.items.every((item) => item.kind === "TEAM"));
  const partyList = (await request("/admin/parties?kind=PARTY", admin)).result;
  assert.ok(!partyList.items.some((item) => item.id === team.id));
  assert.ok(partyList.items.every((item) => item.kind === "PARTY"));
  const expired = await party(expiredOwner);
  await prisma.gameParty.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(Date.now() - 10000) }
  });
  await request(`/admin/parties/${expired.id}/chat/messages`, admin, "GET", undefined, 404);
  const listingFirst = (await request("/admin/parties?limit=2", admin)).result;
  const listingNext = (
    await request(`/admin/parties?limit=2&before=${listingFirst.nextCursor}`, admin)
  ).result;
  assert.ok(
    !listingNext.items.some((item) => listingFirst.items.some((first) => first.id === item.id))
  );
  assert.ok(!listingFirst.items.some((item) => item.id === expired.id));
  assert.ok(!listingNext.items.some((item) => item.id === expired.id));
  await request(`/social/parties/${applicationParty.slug}`, applyCaptain, "DELETE");
  await request(
    `/admin/parties/${applicationParty.id}/chat/messages`,
    admin,
    "GET",
    undefined,
    404
  );
  pass("expired/deleted parties disappear and pagination does not duplicate rosters");

  console.log(
    `PASS all admin/party scenarios (${assertions} HTTP checks; local p50 ${Math.round([...timings].sort((x, y) => x - y)[Math.floor(timings.length / 2)])} ms)`
  );
} finally {
  for (const socket of sockets) socket.disconnect();
  const ids = users.map((user) => user.id);
  await prisma.gameParty.deleteMany({ where: { ownerUserId: { in: ids } } });
  await prisma.gamePartyChatArchive.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.entity.deleteMany({ where: { ownerUserId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}
