import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../config/environment.validation.js";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { PrismaService } from "../../database/prisma.service.js";
import type { RedisService } from "../../redis/redis.service.js";
import type { AuthService } from "../auth/services/auth.service.js";
import type { TelegramTournamentBotService } from "./telegram-tournament-bot.service.js";
import { TelegramOfficialLoginService } from "./telegram-official-login.service.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256" };
const user: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Player",
  avatarUrl: null,
  email: null,
  role: "USER",
  status: "active",
  username: null
};

function setup() {
  const records = new Map<string, string>();
  let sessions = 0;
  let connections = 0;
  const redisClient = {
    get: async (key: string) => records.get(key) ?? null,
    set: async (key: string, value: string) => {
      if (records.has(key)) return null;
      records.set(key, value);
      return "OK";
    },
    eval: async (_script: string, options: { keys: string[]; arguments: string[] }) => {
      const key = options.keys[0]!;
      const raw = records.get(key);
      if (!raw) return 0;
      if (options.arguments.length === 1) {
        records.delete(key);
        return 1;
      }
      const req = JSON.parse(raw) as { browserHash: string; intent: string; userId: string | null };
      if (
        req.browserHash !== options.arguments[0] ||
        req.intent !== options.arguments[1] ||
        (req.intent === "link" && req.userId !== options.arguments[2])
      )
        return 0;
      records.delete(key);
      return 1;
    }
  };
  const prisma = {
    userAuthIdentity: {
      findUnique: async () => ({
        id: "identity",
        userId: user.id,
        providerUserId: "987654321",
        user
      }),
      findFirst: async () => null,
      update: async () => ({})
    }
  };
  const service = new TelegramOfficialLoginService(
    {
      get: (key: string) =>
        key === "TELEGRAM_LOGIN_CLIENT_ID" ? "123456789" : "123456789:test-token"
    } as unknown as ConfigService<EnvironmentVariables, true>,
    { getClient: async () => redisClient } as unknown as RedisService,
    prisma as unknown as PrismaService,
    {
      createAuthResponse: async () => {
        sessions += 1;
        return { accessToken: "session" };
      }
    } as unknown as AuthService,
    {
      linkVerifiedIdentity: async () => {
        connections += 1;
        return user;
      }
    } as unknown as TelegramTournamentBotService
  );
  return { service, prisma, records, sessions: () => sessions, connections: () => connections };
}
function signed(nonce: string) {
  const now = Math.floor(Date.now() / 1000);
  const encoded = [
    { alg: "RS256", kid: jwk.kid },
    {
      iss: "https://oauth.telegram.org",
      aud: "123456789",
      nonce,
      sub: "oidc-subject",
      id: 987654321,
      iat: now,
      exp: now + 3600
    }
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
    .join(".");
  return `${encoded}.${sign("RSA-SHA256", Buffer.from(encoded), privateKey).toString("base64url")}`;
}

describe("official Telegram request boundaries", () => {
  it("does not store the browser proof as plaintext and rejects another browser", async () => {
    const test = setup();
    const req = await test.service.create("login");
    const stored = JSON.parse([...test.records.values()][0]!) as { browserHash: string };
    assert.equal(stored.browserHash, createHash("sha256").update(req.browserToken).digest("hex"));
    await assert.rejects(
      test.service.complete(
        { ...req, browserToken: "another-browser", idToken: signed(req.nonce) },
        "login"
      )
    );
    assert.equal(test.sessions(), 0);
  });
  it("binds a linking request to the authenticated website account and its purpose", async () => {
    const test = setup();
    const req = await test.service.create("link", user);
    const input = { ...req, idToken: signed(req.nonce) };
    await assert.rejects(test.service.complete(input, "link", { ...user, id: "another-user" }));
    await assert.rejects(test.service.complete(input, "login"));
    await assert.rejects(test.service.complete(input, "link", { ...user, status: "suspended" }));
    assert.equal(test.connections(), 0);
    assert.equal(test.sessions(), 0);
  });
  it("issues one login session and rejects replay", async (context) => {
    context.mock.method(
      globalThis,
      "fetch",
      async () => new Response(JSON.stringify({ keys: [jwk] }))
    );
    const test = setup();
    const req = await test.service.create("login");
    const input = { ...req, idToken: signed(req.nonce) };
    await test.service.complete(input, "login");
    await assert.rejects(test.service.complete(input, "login"));
    assert.equal(test.sessions(), 1);
  });
  it("never transfers a Telegram identity linked to another website account", async (context) => {
    let botRequests = 0;
    context.mock.method(globalThis, "fetch", async () => {
      botRequests += 1;
      return new Response(JSON.stringify({ keys: [jwk] }));
    });
    const test = setup();
    test.prisma.userAuthIdentity.findUnique = async () => ({
      id: "identity",
      userId: "other-account",
      providerUserId: "987654321",
      user
    });
    const req = await test.service.create("link", user);
    await assert.rejects(
      test.service.complete({ ...req, idToken: signed(req.nonce) }, "link", user)
    );
    assert.equal(test.connections(), 0);
    assert.equal(botRequests, 1); // Only the JWKS request; no attempt to contact the other account's bot.
  });
  it("requires actual bot messaging permission before connecting", async (context) => {
    context.mock.method(globalThis, "fetch", async (url: unknown) =>
      String(url).includes("jwks")
        ? new Response(JSON.stringify({ keys: [jwk] }))
        : new Response("{}", { status: 403 })
    );
    const test = setup();
    const req = await test.service.create("link", user);
    await assert.rejects(
      test.service.complete({ ...req, idToken: signed(req.nonce) }, "link", user)
    );
    assert.equal(test.connections(), 0);
  });
  it("connects a verified Telegram identity after the bot permission check", async (context) => {
    context.mock.method(
      globalThis,
      "fetch",
      async (url: unknown) =>
        new Response(
          JSON.stringify(
            String(url).includes("jwks") ? { keys: [jwk] } : { ok: true, result: true }
          )
        )
    );
    const test = setup();
    const req = await test.service.create("link", user);
    assert.deepEqual(
      await test.service.complete({ ...req, idToken: signed(req.nonce) }, "link", user),
      { linked: true }
    );
    assert.equal(test.connections(), 1);
    assert.equal(test.sessions(), 0);
  });
});
