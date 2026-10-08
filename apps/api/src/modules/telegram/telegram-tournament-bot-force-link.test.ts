import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { PrismaService } from "../../database/prisma.service.js";
import type { RedisService } from "../../redis/redis.service.js";
import type { AuthService } from "../auth/services/auth.service.js";
import { TelegramTournamentBotService } from "./telegram-tournament-bot.service.js";

const user: AuthenticatedUser = { id: "website-account", displayName: "Website player", username: null,
  email: null, avatarUrl: null, role: "USER", status: "active" };
const requestId = "a".repeat(32);

function fixture(identityUserId = user.id) {
  const records = new Map<string, string>();
  const writes: Array<{ key: string; options: { EX: number; NX?: boolean } }> = [];
  let authCalls = 0;
  const identity = { id: "identity", providerUserId: "123456789", userId: identityUserId, telegramUsername: null };
  const client = {
    get: async (key: string) => records.get(key) ?? null,
    set: async (key: string, value: string, options: { EX: number; NX?: boolean }) => {
      writes.push({ key, options }); records.set(key, value); return "OK";
    },
    eval: async (script: string) => script.includes("request.status = 'processing'") ? "claimed" :
      script.includes("request.status = ARGV[2]") ? "ok" : 1
  };
  const prisma = {
    user: { findUnique: async () => user },
    userAuthIdentity: {
      findFirst: async () => identity,
      findUnique: async () => identity
    },
    telegramBotStart: { findUnique: async () => ({ telegramUserId: identity.providerUserId }), upsert: async () => ({}) },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma)
  };
  const auth = { createAuthResponse: async (input: { id: string }) => { authCalls++; return { user: { id: input.id } }; } };
  const service = new TelegramTournamentBotService(prisma as unknown as PrismaService,
    { getClient: async () => client } as unknown as RedisService, auth as unknown as AuthService);
  return { service, records, writes, authCalls: () => authCalls };
}

test("existing tournament shortcut remains unchanged", async () => {
  const { service, writes } = fixture();
  assert.deepEqual(await service.createLinkRequest(user), { botStarted: true });
  assert.equal(writes.length, 0);
});

test("explicit website-to-bot entry always creates an account-bound five-minute confirmation", async () => {
  const { service, records, writes } = fixture();
  const created = await service.createLinkRequest(user, true);
  assert.equal(created.botStarted, false);
  if (created.botStarted) throw new Error("Confirmation request missing");
  assert.match(created.requestId, /^[a-f0-9]{32}$/);
  assert.equal(created.expiresIn, 300);
  assert.equal(new URL(created.botUrl).searchParams.get("start"), `tournament_link_${created.requestId}`);
  assert.equal(JSON.parse(records.get(writes[0]!.key)!).userId, user.id);
  assert.deepEqual(writes[0]!.options, { EX: 300, NX: true });
});

test("inactive website account cannot initiate bot entry", async () => {
  const { service, writes } = fixture();
  await assert.rejects(service.createLinkRequest({ ...user, status: "disabled" }, true), UnauthorizedException);
  assert.equal(writes.length, 0);
});

test("an expired explicit request is not approved merely because Telegram was already connected", async () => {
  const { service } = fixture();
  assert.deepEqual(await service.poll(requestId, user.id, true), { status: "expired" });
  assert.deepEqual(await service.poll(requestId, user.id), { status: "approved" });
});

test("another website account cannot poll this confirmation", async () => {
  const { service, records } = fixture();
  records.set(`auth:telegram-tournament-bot:${requestId}`, JSON.stringify({ userId: user.id, status: "approved" }));
  await assert.rejects(service.poll(requestId, "other-account", true), UnauthorizedException);
});

test("confirmation never moves a Telegram identity from another FDP account", async () => {
  const { service, records, authCalls } = fixture("other-account");
  records.set(`auth:telegram-tournament-bot:${requestId}`, JSON.stringify({ userId: user.id, status: "pending" }));
  await assert.rejects(service.confirm(requestId, "123456789"), ConflictException);
  assert.equal(authCalls(), 0);
});

test("valid confirmation opens the exact website account", async () => {
  const { service, records, authCalls } = fixture();
  records.set(`auth:telegram-tournament-bot:${requestId}`, JSON.stringify({ userId: user.id, status: "pending" }));
  const result = await service.confirm(requestId, "123456789");
  assert.equal(result.user.id, user.id);
  assert.equal(authCalls(), 1);
});
