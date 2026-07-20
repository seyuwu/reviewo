/**
 * Smoke: joining/accepting one party cancels other PENDING APPLICATION invites.
 * Also checks concurrent double-accept race (one wins, other stale).
 */
import { createHmac, randomUUID } from "node:crypto";

const API = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const SECRET = process.env.JWT_SECRET ?? "reviewo_development_jwt_secret_change_me";

const CAPTAIN_A = process.env.CAPTAIN_A_ID ?? "fc466536-18e9-4df8-a099-f9a2bc5c236e";
const CAPTAIN_B = process.env.CAPTAIN_B_ID ?? "b348ede5-6cdb-4b99-a03e-a83604c0bab8";
const APPLICANT = process.env.APPLICANT_ID ?? "e735f0a8-8026-4ac2-a83d-7a71e50312ca";

function signAccessToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ exp: now + 3600, iat: now, sub: userId })
  ).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function api(method, path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, status: response.status, json };
}

async function createConfirmParty(token, name) {
  const created = await api("POST", "/social/parties", token, {
    kind: "PARTY",
    name
  });
  if (!created.ok) {
    throw new Error(`create party failed: ${created.status} ${JSON.stringify(created.json)}`);
  }

  const patched = await api("PATCH", `/social/parties/${created.json.slug}/join-mode`, token, {
    joinMode: "CONFIRM"
  });
  if (!patched.ok) {
    throw new Error(`set CONFIRM failed: ${patched.status} ${JSON.stringify(patched.json)}`);
  }

  return patched.json;
}

async function claim(token, slug, positionRole) {
  return api("POST", `/social/parties/${encodeURIComponent(slug)}/claim`, token, {
    positionRole
  });
}

async function acceptInvite(token, inviteId) {
  return api("POST", `/social/parties/invites/${inviteId}/accept`, token);
}

async function leave(token, slug) {
  return api("DELETE", `/social/parties/${encodeURIComponent(slug)}/members/me`, token);
}

async function findOutgoingApplication(captainToken, partySlug, inviteeUserId) {
  const me = await api("GET", "/social/parties/me", captainToken);
  if (!me.ok) {
    throw new Error(`parties/me failed: ${me.status} ${JSON.stringify(me.json)}`);
  }
  const outgoing = me.json.outgoingInvites ?? [];
  return (
    outgoing.find(
      (row) =>
        row.partySlug === partySlug &&
        row.inviteeUserId === inviteeUserId &&
        row.inviteKind === "APPLICATION" &&
        row.status === "PENDING"
    ) ?? null
  );
}

async function main() {
  const captainAToken = signAccessToken(CAPTAIN_A);
  const captainBToken = signAccessToken(CAPTAIN_B);
  const applicantToken = signAccessToken(APPLICANT);
  const suffix = randomUUID().slice(0, 8);

  console.log("1) create two CONFIRM parties");
  const partyA = await createConfirmParty(captainAToken, `Smoke Cancel A ${suffix}`);
  const partyB = await createConfirmParty(captainBToken, `Smoke Cancel B ${suffix}`);
  console.log(`   A=${partyA.slug} B=${partyB.slug}`);

  console.log("2) applicant applies to both");
  const appA = await claim(applicantToken, partyA.slug, "2");
  const appB = await claim(applicantToken, partyB.slug, "3");
  if (!appA.ok || !appB.ok) {
    throw new Error(`claim failed A=${appA.status} B=${appB.status}`);
  }

  const inviteA = await findOutgoingApplication(captainAToken, partyA.slug, APPLICANT);
  const inviteB = await findOutgoingApplication(captainBToken, partyB.slug, APPLICANT);
  if (!inviteA?.id || !inviteB?.id) {
    throw new Error(`expected applications: A=${JSON.stringify(inviteA)} B=${JSON.stringify(inviteB)}`);
  }
  console.log(`   inviteA=${inviteA.id} inviteB=${inviteB.id}`);

  console.log("3) captain A accepts → B application must CANCEL");
  const accepted = await acceptInvite(captainAToken, inviteA.id);
  if (!accepted.ok) {
    throw new Error(`accept A failed: ${accepted.status} ${JSON.stringify(accepted.json)}`);
  }

  const stillPending = await findOutgoingApplication(captainBToken, partyB.slug, APPLICANT);
  if (stillPending) {
    throw new Error(`B application still PENDING: ${stillPending.id}`);
  }

  const acceptStale = await acceptInvite(captainBToken, inviteB.id);
  if (acceptStale.ok) {
    throw new Error("B accept should fail after cross-cancel");
  }
  if (acceptStale.status !== 404) {
    throw new Error(
      `expected 404 on stale B accept, got ${acceptStale.status} ${JSON.stringify(acceptStale.json)}`
    );
  }
  console.log("   ok: B invite stale/cancelled");

  await leave(applicantToken, partyA.slug);

  console.log("4) race: concurrent accept of two apps");
  const partyC = await createConfirmParty(captainAToken, `Smoke Race C ${suffix}`);
  const partyD = await createConfirmParty(captainBToken, `Smoke Race D ${suffix}`);
  await claim(applicantToken, partyC.slug, "4");
  await claim(applicantToken, partyD.slug, "5");
  const raceInviteC = await findOutgoingApplication(captainAToken, partyC.slug, APPLICANT);
  const raceInviteD = await findOutgoingApplication(captainBToken, partyD.slug, APPLICANT);
  if (!raceInviteC?.id || !raceInviteD?.id) {
    throw new Error("race claims missing applications");
  }

  const [r1, r2] = await Promise.all([
    acceptInvite(captainAToken, raceInviteC.id),
    acceptInvite(captainBToken, raceInviteD.id)
  ]);

  const wins = [r1, r2].filter((row) => row.ok).length;
  const losses = [r1, r2].filter((row) => !row.ok).length;
  if (wins !== 1 || losses !== 1) {
    throw new Error(
      `race expected 1 win / 1 loss, got wins=${wins} losses=${losses} ` +
        `r1=${r1.status} ${JSON.stringify(r1.json)} r2=${r2.status} ${JSON.stringify(r2.json)}`
    );
  }
  console.log(`   ok: race serialized (win=${r1.ok ? "C" : "D"})`);

  console.log("5) OPEN join cancels other apps");
  const openParty = await api("POST", "/social/parties", captainAToken, {
    kind: "PARTY",
    name: `Smoke Open ${suffix}`
  });
  if (!openParty.ok) {
    throw new Error(`open party create failed: ${openParty.status}`);
  }

  if (r1.ok) {
    await leave(applicantToken, partyC.slug);
  } else {
    await leave(applicantToken, partyD.slug);
  }

  const confirmLeft = await createConfirmParty(captainBToken, `Smoke Open Cancel ${suffix}`);
  await claim(applicantToken, confirmLeft.slug, "1");
  const leftoverInvite = await findOutgoingApplication(
    captainBToken,
    confirmLeft.slug,
    APPLICANT
  );
  if (!leftoverInvite?.id) {
    throw new Error("leftover application missing");
  }

  const openJoin = await claim(applicantToken, openParty.json.slug, "2");
  if (!openJoin.ok) {
    throw new Error(`OPEN claim failed: ${openJoin.status} ${JSON.stringify(openJoin.json)}`);
  }
  if (openJoin.json.isMember !== true) {
    throw new Error(`OPEN join should make member: ${JSON.stringify(openJoin.json)}`);
  }

  const leftoverStill = await findOutgoingApplication(
    captainBToken,
    confirmLeft.slug,
    APPLICANT
  );
  if (leftoverStill) {
    throw new Error(`leftover still PENDING after OPEN join: ${leftoverStill.id}`);
  }

  const stale = await acceptInvite(captainBToken, leftoverInvite.id);
  if (stale.ok || stale.status !== 404) {
    throw new Error(
      `OPEN join should cancel leftover app; got ${stale.status} ${JSON.stringify(stale.json)}`
    );
  }
  console.log("   ok: OPEN join cancelled leftover APPLICATION");

  console.log("ALL GREEN");
}

main().catch((error) => {
  console.error("FAIL:", error);
  process.exit(1);
});
