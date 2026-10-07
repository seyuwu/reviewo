import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthenticatedRequest, AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { TournamentTelegramLinkedGuard } from "./tournament-telegram-linked.guard.js";

const user: AuthenticatedUser = {
  avatarUrl: null,
  displayName: "Player",
  email: null,
  id: "11111111-1111-4111-8111-111111111111",
  role: "USER",
  status: "active",
  username: null
};

function executionContext(request: AuthenticatedRequest) {
  return {
    switchToHttp: () => ({ getRequest: () => request })
  } as never;
}

describe("TournamentTelegramLinkedGuard", () => {
  it("allows an active account linked to Telegram", async () => {
    const prisma = {
      userAuthIdentity: { findFirst: async () => ({ id: "telegram-identity" }) }
    } as unknown as PrismaService;
    const guard = new TournamentTelegramLinkedGuard(prisma);

    assert.equal(await guard.canActivate(executionContext({ user })), true);
  });

  it("blocks an authenticated account without a Telegram identity", async () => {
    const prisma = {
      userAuthIdentity: { findFirst: async () => null }
    } as unknown as PrismaService;
    const guard = new TournamentTelegramLinkedGuard(prisma);

    await assert.rejects(guard.canActivate(executionContext({ user })), (error: unknown) =>
      typeof error === "object" && error !== null && "getStatus" in error &&
      typeof error.getStatus === "function" && error.getStatus() === 403
    );
  });

  it("allows an active administrator without a Telegram identity", async () => {
    let identityLookups = 0;
    const prisma = {
      userAuthIdentity: { findFirst: async () => { identityLookups += 1; return null; } }
    } as unknown as PrismaService;
    const guard = new TournamentTelegramLinkedGuard(prisma);

    assert.equal(await guard.canActivate(executionContext({ user: { ...user, role: "ADMIN" } })), true);
    assert.equal(identityLookups, 0);
  });

  it("still blocks a moderator without a Telegram identity", async () => {
    const prisma = {
      userAuthIdentity: { findFirst: async () => null }
    } as unknown as PrismaService;
    const guard = new TournamentTelegramLinkedGuard(prisma);

    await assert.rejects(
      guard.canActivate(executionContext({ user: { ...user, role: "TOURNAMENT_MODERATOR" } })),
      (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error &&
        typeof error.getStatus === "function" && error.getStatus() === 403
    );
  });

  it("does not permit missing or inactive users", async () => {
    const prisma = {
      userAuthIdentity: { findFirst: async () => ({ id: "telegram-identity" }) }
    } as unknown as PrismaService;
    const guard = new TournamentTelegramLinkedGuard(prisma);

    await assert.rejects(guard.canActivate(executionContext({})), (error: unknown) =>
      typeof error === "object" && error !== null && "getStatus" in error &&
      typeof error.getStatus === "function" && error.getStatus() === 401
    );
    await assert.rejects(
      guard.canActivate(executionContext({ user: { ...user, status: "suspended" } })),
      (error: unknown) => typeof error === "object" && error !== null && "getStatus" in error &&
        typeof error.getStatus === "function" && error.getStatus() === 401
    );
  });
});
