import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaService } from "../../database/prisma.service.js";
import type { AuthService } from "../auth/services/auth.service.js";
import type { RedisService } from "../../redis/redis.service.js";
import { TelegramBotService } from "./telegram-bot.service.js";

const userId = "11111111-1111-4111-8111-111111111111";
const telegramUserId = "123456789";

function buildService(options?: {
  telegramIdentity?: { providerUserId: string; userId: string } | null;
  userIdentity?: { providerUserId: string; userId: string } | null;
}) {
  let created = false;
  const transaction = {
    userAuthIdentity: {
      create: async () => {
        created = true;
      },
      findFirst: async () => options?.userIdentity ?? null,
      findUnique: async () => options?.telegramIdentity ?? null
    }
  };
  const prisma = {
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction)
  } as unknown as PrismaService;
  const service = new TelegramBotService(
    {} as AuthService,
    {} as never,
    prisma,
    {} as RedisService
  );

  return { created: () => created, service };
}

describe("Telegram bot account identity", () => {
  it("creates a Telegram identity for the authenticated account", async () => {
    const fixture = buildService();

    assert.deepEqual(
      await fixture.service.ensureTelegramIdentity(userId, telegramUserId),
      { linked: true }
    );
    assert.equal(fixture.created(), true);
  });

  it("repairs an existing matching identity without creating a duplicate", async () => {
    const fixture = buildService({
      telegramIdentity: { providerUserId: telegramUserId, userId },
      userIdentity: { providerUserId: telegramUserId, userId }
    });

    await fixture.service.ensureTelegramIdentity(userId, telegramUserId);

    assert.equal(fixture.created(), false);
  });

  it("does not take a Telegram identity from another Opinia account", async () => {
    const fixture = buildService({
      telegramIdentity: { providerUserId: telegramUserId, userId: "other-user" }
    });

    await assert.rejects(fixture.service.ensureTelegramIdentity(userId, telegramUserId));
    assert.equal(fixture.created(), false);
  });
});
