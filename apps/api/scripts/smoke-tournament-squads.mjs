/** Local-only regression: event squads, roles, permissions and normal matchmaking. */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const api = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const host = new URL(api).hostname;
const databaseHost = new URL(process.env.DATABASE_URL).hostname;
assert.equal(process.env.NODE_ENV, "development", "Run only in the local development container");
assert.ok(["127.0.0.1", "localhost"].includes(host));
assert.ok(["postgres", "127.0.0.1", "localhost"].includes(databaseHost));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const prefix = `squad-qa-${Date.now()}`;
const users = [];
const timings = [];

function token(userId) {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ sub: userId, iat: now, exp: now + 3600 })).toString("base64url");
  return `${h}.${p}.${createHmac("sha256", process.env.JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`;
}

async function request(path, actor, method = "GET", body, expected = 200) {
  const start = performance.now();
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json();
  timings.push(performance.now() - start);
  const statuses = Array.isArray(expected) ? expected : [expected];
  assert.ok(statuses.includes(response.status), `${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}

async function player(index, role = "USER") {
  const user = await prisma.user.create({ data: { displayName: `${prefix}-${index}`, role } });
  const actor = { ...user, token: token(user.id) };
  users.push(actor);
  await request("/dota/profiles", actor, "POST", {
    title: actor.displayName, roles: ["1", "2", "3", "4", "5"], mmr: "3000", server: "EU", matchMode: "auto"
  }, 201);
  return actor;
}

async function tournament(admin, suffix, maxTeams = 16) {
  return request("/dota/tournament-management", admin, "POST", {
    title: `${prefix}-${suffix}`, slug: `${prefix}-${suffix}`, maxTeams, status: "REGISTRATION_OPEN",
    startsAt: new Date(Date.now() + 3600000).toISOString(),
    registrationClosesAt: new Date(Date.now() + 1800000).toISOString()
  }, 201);
}

const ok = (label) => console.log(`PASS ${label}`);
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${api}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) break;
    } catch {
      // The dev server may still be starting after compilation.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const admin = await player("admin", "ADMIN");
  const a = await Promise.all(Array.from({ length: 6 }, (_, i) => player(`a${i}`)));
  const b = await Promise.all(Array.from({ length: 6 }, (_, i) => player(`b${i}`)));
  const cup = await tournament(admin, "cup");
  const base = `/dota/tournaments/${cup.slug}`;
  await request(`${base}/squads`, null, "POST", { name: "Anonymous", positionRole: "1" }, 401);
  await request("/dota/tournament-management", a[0], "POST", { title: "Forbidden" }, 403);
  const partiesBefore = await prisma.gameParty.count();
  let detail = await request(`${base}/squads`, a[0], "POST", { name: "QA Alpha", positionRole: "1", joinMode: "OPEN" }, 201);
  const entryA = detail.entries.find((entry) => entry.teamName === "QA Alpha").id;
  assert.equal(detail.registeredTeams, 0);
  assert.equal(detail.entries[0].status, "RECRUITING");
  assert.equal(await prisma.gameParty.count(), partiesBefore);
  assert.equal((await prisma.dotaTournamentEntry.findUnique({ where: { id: entryA } })).teamPartyId, null);
  await request(`${base}/squads`, a[0], "POST", { name: "Duplicate", positionRole: "2" }, 409);
  await request(`${base}/squads`, a[1], "POST", { name: "Invalid role", positionRole: "6" }, 400);
  await request(`${base}/entries/${entryA}/join`, a[1], "POST", { positionRole: "1" }, 409);
  await request(`${base}/entries/${entryA}/join-mode`, a[1], "PATCH", { joinMode: "CONFIRM" }, 403);
  ok("standalone squad creates no ordinary party; authentication, captain rights and occupied roles");

  const competing = await Promise.all([
    request(`${base}/entries/${entryA}/join`, a[1], "POST", { positionRole: "2" }, [201, 409]),
    request(`${base}/entries/${entryA}/join`, a[5], "POST", { positionRole: "2" }, [201, 409])
  ]);
  assert.equal(competing.filter((result) => result.result === "JOINED").length, 1);
  for (let i = 2; i <= 4; i++) await request(`${base}/entries/${entryA}/join`, a[i], "POST", { positionRole: String(i + 1) }, 201);
  detail = await request(base);
  assert.equal(detail.registeredTeams, 1);
  assert.equal(detail.entries.find((entry) => entry.id === entryA).members.length, 5);
  await request(`${base}/entries/${entryA}/members/me`, a[0], "DELETE", undefined, 409);
  await request(`${base}/entries/${entryA}/members/me`, a[4], "DELETE");
  assert.equal((await request(base)).registeredTeams, 0);
  await request(`${base}/entries/${entryA}/join`, a[4], "POST", { positionRole: "5" }, 201);
  ok("concurrent joins keep one player per role; 5 players register, leaving and rejoining update the count");

  detail = await request(`${base}/squads`, b[0], "POST", { name: "QA Beta", positionRole: "1", joinMode: "CONFIRM" }, 201);
  const entryB = detail.entries.find((entry) => entry.teamName === "QA Beta").id;
  await request(`${base}/entries/${entryB}/join`, b[1], "POST", { positionRole: "1" }, 409);
  for (let i = 1; i <= 4; i++) {
    const applied = await request(`${base}/entries/${entryB}/join`, b[i], "POST", { positionRole: String(i + 1) }, 201);
    assert.equal(applied.result, "REQUESTED");
  }
  assert.equal((await request(`${base}/managed-entries`, a[0])).length, 1);
  assert.deepEqual(await request(`${base}/managed-entries`, b[5]), []);
  const managed = await request(`${base}/managed-entries`, b[0]);
  assert.equal(managed[0].requests.length, 4);
  const firstRequest = managed[0].requests[0];
  await request(`${base}/entries/${entryB}/requests/${firstRequest.id}`, b[1], "PATCH", { decision: "ACCEPT" }, 403);
  for (const applied of managed[0].requests) await request(`${base}/entries/${entryB}/requests/${applied.id}`, b[0], "PATCH", { decision: "ACCEPT" });
  await request(`${base}/entries/${entryB}/requests/${firstRequest.id}`, b[0], "PATCH", { decision: "ACCEPT" }, 404);
  assert.equal((await request(base)).registeredTeams, 2);
  assert.equal(await prisma.gameParty.count(), partiesBefore);
  ok("applications wait for captain approval; accepted members remain only in the tournament");

  const another = await tournament(admin, "another");
  await request(`/dota/tournaments/${another.slug}/squads`, a[0], "POST", { name: "Another squad", positionRole: "1" }, 201);
  ok("one player can participate in separate tournaments");

  await request(`/dota/tournament-management/${cup.slug}`, admin, "PATCH", { status: "REGISTRATION_CLOSED" });
  const match = await request(`/dota/tournament-management/${cup.slug}/matches`, admin, "POST", {
    entryAId: entryA, entryBId: entryB, roundNumber: 1, matchNumber: 1,
    scheduledAt: new Date(Date.now() + 60000).toISOString(), hostSide: "A"
  }, 201);
  const matchBase = `${base}/matches/${match.id}`;
  await request(matchBase, b[5], "GET", undefined, 403);
  await request(`${matchBase}/lobby`, a[0], "POST", {
    lobbyName: "QA lobby", lobbyPassword: "local-qa-only", gameMode: cup.gameMode,
    serverRegion: cup.serverRegion, allowSpectators: cup.allowSpectators, cheatsEnabled: cup.cheatsEnabled
  }, 201);
  await request(`${matchBase}/confirm-lobby`, a[0], "POST", {}, 403);
  await request(`${matchBase}/confirm-lobby`, b[0], "POST", {}, 201);
  await request(`${matchBase}/start`, a[0], "POST", {}, 201);
  await request(`${matchBase}/result`, a[0], "POST", { winnerEntryId: entryA }, 201);
  await request(`${matchBase}/confirm-result`, b[0], "POST", {}, 201);
  assert.equal((await request(matchBase, a[0])).winnerEntryId, entryA);
  ok("temporary squads complete lobby settings, opposite-side confirmation, match and result");

  const captain = await player("party-captain", "ADMIN");
  const mate = await player("party-mate", "ADMIN");
  const solo1 = await player("solo1", "ADMIN");
  const solo2 = await player("solo2", "ADMIN");
  const team = await request("/social/parties", captain, "POST", { kind: "TEAM", name: `${prefix}-team` }, 201);
  await request("/dota/profiles/lfg/looking", captain, "POST", { looking: true, partySlug: team.slug, recruitedRoles: ["2"] }, 409);
  const party = await request("/social/parties", captain, "POST", { kind: "PARTY", name: `${prefix}-party` }, 201);
  await request(`/social/parties/${party.slug}/members/me/position`, captain, "PATCH", { positionRole: "1" });
  await request("/dota/profiles/lfg/looking", captain, "POST", { looking: true, source: "web", partySlug: party.slug, recruitedRoles: ["2", "3"] }, 201);
  assert.deepEqual((await request(`/social/parties/${party.slug}`, captain)).recruitedRoles, ["2", "3"]);
  const invite = await request(`/social/parties/${party.slug}/join-token`, captain, "POST", {}, 201);
  const joined = await request("/social/parties/join", mate, "POST", { token: invite.token, positionRole: "2" }, 201);
  assert.equal(joined.memberCount, 2);
  assert.equal((await request("/social/parties/me", mate)).party.slug, party.slug);
  await request("/dota/profiles/lfg/looking", captain, "POST", { looking: false, partySlug: party.slug }, 201);
  await request(`/social/parties/${party.slug}/members/me`, mate, "DELETE");
  await request(`/social/parties/${party.slug}`, captain, "DELETE");
  ok("ordinary party creation, role recruitment, invite link, membership, stop, leave and delete");

  await request("/dota/profiles/lfg/looking", solo1, "POST", { looking: true, source: "web" }, 201);
  await request("/dota/profiles/lfg/looking", solo2, "POST", { looking: true, source: "telegram" }, 201);
  const matched = await request("/social/parties/auto-match/solo-group/web", solo1, "POST", {
    members: [{ userId: solo1.id, positionRole: "3" }, { userId: solo2.id, positionRole: "4" }]
  }, 201);
  assert.equal(matched.kind, "PARTY");
  assert.equal(matched.memberCount, 2);
  for (const solo of [solo1, solo2]) {
    // The selected captain continues recruitment for the remaining party roles.
    assert.equal((await request("/dota/profiles/me", solo)).looking, solo.id === matched.ownerUserId);
  }
  assert.deepEqual(matched.recruitedRoles, ["1", "2", "5"]);
  assert.equal(await prisma.gamePartyMember.count({ where: { partyId: team.id } }), 1);
  assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { entryId: entryA, isActive: true } }), 5);
  ok("mixed web/Telegram solo matchmaking creates an ordinary party, not a tournament squad");

  const teamCup = await tournament(admin, "team");
  const teamBase = `/dota/tournaments/${teamCup.slug}`;
  await request(`${teamBase}/entries`, captain, "POST", { teamSlug: team.slug }, 201);
  await request(`${teamBase}/entries`, captain, "POST", { teamSlug: team.slug }, 409);
  const teamEntry = (await request(teamBase)).entries[0];
  await request(`${teamBase}/entries/${teamEntry.id}/members/me/position`, mate, "PATCH", { positionRole: "1" }, 409);
  await request(`${teamBase}/entries/${teamEntry.id}/members/me/position`, captain, "PATCH", { positionRole: "1" });
  await request(`${teamBase}/entries/${teamEntry.id}/members/me/position`, captain, "PATCH", { positionRole: "3" }, 409);
  await request(`${teamBase}/entries/${teamEntry.id}/join`, mate, "POST", { positionRole: "2" }, 201);
  const applications = await request(`${teamBase}/managed-entries`, captain);
  await request(`${teamBase}/entries/${teamEntry.id}/requests/${applications[0].requests[0].id}`, captain, "PATCH", { decision: "ACCEPT" });
  assert.equal(await prisma.gamePartyMember.count({ where: { partyId: team.id } }), 1);
  assert.equal((await request(teamBase)).entries[0].members.length, 2);
  await request(`${teamBase}/entries/${teamEntry.id}`, captain, "DELETE");
  assert.equal(await prisma.dotaTournamentEntryMember.count({ where: { entryId: teamEntry.id, isActive: true } }), 0);
  ok("persistent team tournament snapshots, duplicate registration protection and withdrawal");
  console.log(`PASS all HTTP scenarios (${timings.length} requests; local p50 ${Math.round([...timings].sort((x,y)=>x-y)[Math.floor(timings.length/2)])} ms)`);
} finally {
  const ids = users.map((user) => user.id);
  await prisma.dotaTournament.deleteMany({ where: { slug: { startsWith: prefix } } });
  await prisma.gameParty.deleteMany({ where: { ownerUserId: { in: ids } } });
  await prisma.entity.deleteMany({ where: { ownerUserId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}
