/**
 * Smoke: position change emits party_updated to party_view watchers.
 */
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire("/workspace/apps/web/package.json");
const { io } = require("socket.io-client");

const API = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const SECRET = process.env.JWT_SECRET ?? "reviewo_development_jwt_secret_change_me";
const SLUG = process.env.PARTY_SLUG ?? "party-ancient-wraths";
const OWNER_ID = process.env.OWNER_USER_ID ?? "bab66963-235f-4cab-80ff-da9065db61e9";
const MEMBER_ID = process.env.MEMBER_USER_ID ?? "07a5320d-e0f7-482f-832f-a577cf209812";

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

function waitForPartyUpdated(socket, predicate, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("party_updated", onEvent);
      reject(new Error("Timeout waiting for party_updated"));
    }, timeoutMs);

    function onEvent(party) {
      if (party?.slug !== SLUG) {
        return;
      }

      if (!predicate(party)) {
        return;
      }

      clearTimeout(timer);
      socket.off("party_updated", onEvent);
      resolve(party);
    }

    socket.on("party_updated", onEvent);
  });
}

async function connectWatch(token) {
  const socket = io(`${API}/parties`, {
    auth: { token },
    transports: ["websocket"]
  });

  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
    setTimeout(() => reject(new Error("connect timeout")), 8000);
  });

  const ack = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("watch timeout")), 8000);
    socket.emit("watch", { partySlug: SLUG }, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });

  if (!ack?.ok) {
    socket.disconnect();
    throw new Error(`watch failed: ${JSON.stringify(ack)}`);
  }

  return socket;
}

async function patchPosition(token, positionRole) {
  const response = await fetch(
    `${API}/social/parties/${encodeURIComponent(SLUG)}/members/me/position`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ positionRole })
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PATCH position ${positionRole}: ${response.status} ${text}`);
  }

  return JSON.parse(text);
}

async function main() {
  const ownerToken = signAccessToken(OWNER_ID);
  const memberToken = signAccessToken(MEMBER_ID);
  const watcher = await connectWatch(ownerToken);

  try {
    const clearWait = waitForPartyUpdated(
      watcher,
      (party) => party.members.find((m) => m.userId === MEMBER_ID)?.positionRole === null
    );
    await patchPosition(memberToken, null);
    await clearWait;
    console.log("ok: clear slot → party_updated (null)");

    const claimWait = waitForPartyUpdated(
      watcher,
      (party) => party.members.find((m) => m.userId === MEMBER_ID)?.positionRole === "3"
    );
    await patchPosition(memberToken, "3");
    await claimWait;
    console.log("ok: claim slot 3 → party_updated");
    console.log("PASS party position realtime");
  } finally {
    watcher.disconnect();
  }
}

main().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
