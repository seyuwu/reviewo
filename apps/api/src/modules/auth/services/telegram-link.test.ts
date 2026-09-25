import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { PrismaService } from "../../../database/prisma.service.js";
import type { AuthRepository } from "../repositories/auth.repository.js";
import type { JwtTokenService } from "./jwt-token.service.js";
import type { PasswordHasherService } from "./password-hasher.service.js";
import type { UsersService } from "../../users/services/users.service.js";
import type { DiscordOauthService } from "./discord-oauth.service.js";
import type { ProductAnalyticsService } from "../../analytics/services/product-analytics.service.js";
import { AuthService } from "./auth.service.js";

const user: AuthenticatedUser = {
  avatarUrl: null,
  displayName: "Dota player",
  email: "player@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  role: "USER",
  status: "active",
  username: null
};

function buildService(options: { codeExists: boolean; telegramIdentityExists?: boolean }) {
  let identityCreated = false;
  let codeConsumed = false;
  const code = {
    consumedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    id: "22222222-2222-4222-8222-222222222222",
    user,
    userId: user.id
  };
  const transaction = {
    telegramLinkCode: {
      findUnique: async () => (options.codeExists ? code : null),
      updateMany: async () => {
        codeConsumed = true;
        return { count: 1 };
      }
    },
    userAuthIdentity: {
      findFirst: async () => null,
      findUnique: async () => (options.telegramIdentityExists ? { userId: user.id } : null)
    }
  };
  const repository = {
    createTelegramIdentity: async () => {
      identityCreated = true;
      return { providerUserId: "12345", userId: user.id };
    },
    createRefreshToken: async () => undefined,
    createRefreshTokenPlaintext: () => "refresh-token",
    findDiscordIdentityByUserId: async () => null,
    findTelegramIdentityByUserId: async () => ({ providerUserId: "12345", userId: user.id }),
    hashRefreshToken: () => "refresh-hash",
    isUniqueConstraintError: () => false
  } as unknown as AuthRepository;
  const prisma = {
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction)
  } as unknown as PrismaService;
  const config = {
    get: (name: string) => (name === "JWT_ACCESS_TOKEN_TTL_SECONDS" ? 604800 : 2592000)
  };
  const jwt = { signAccessToken: () => "access-token" } as unknown as JwtTokenService;
  const service = new AuthService(
    repository,
    config as never,
    {} as DiscordOauthService,
    jwt,
    {} as PasswordHasherService,
    prisma,
    {} as UsersService,
    {} as ProductAnalyticsService
  );
  return {
    service,
    wasCodeConsumed: () => codeConsumed,
    wasIdentityCreated: () => identityCreated
  };
}

describe("Telegram account pairing", () => {
  it("links a valid one-time code and returns a bot session", async () => {
    const fixture = buildService({ codeExists: true });
    const response = await fixture.service.completeTelegramLink({
      code: "12345678",
      telegramUserId: "12345"
    });

    assert.equal(response.accessToken, "access-token");
    assert.equal(response.user.telegramLinked, true);
    assert.equal(fixture.wasCodeConsumed(), true);
    assert.equal(fixture.wasIdentityCreated(), true);
  });

  it("rejects an unknown pairing code without linking a Telegram account", async () => {
    const fixture = buildService({ codeExists: false });

    await assert.rejects(
      fixture.service.completeTelegramLink({ code: "00000000", telegramUserId: "12345" })
    );
    assert.equal(fixture.wasIdentityCreated(), false);
  });
});
