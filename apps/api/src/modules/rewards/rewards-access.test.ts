import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants.js";
import { ConfigService } from "@nestjs/config";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { EnvironmentVariables } from "../../config/environment.validation.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { AdminGuard } from "../auth/guards/admin.guard.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { AdminRewardsController, RewardsController } from "./rewards.controller.js";
import { RewardsAccessService, RewardsAdminGuard } from "./rewards-access.service.js";

const user = (role: AuthenticatedUser["role"] = "USER"): AuthenticatedUser => ({
  id: "authenticated-account",
  role,
  avatarUrl: null,
  displayName: "Admin QA",
  email: null,
  status: "active",
  username: null
});
const context = (account?: AuthenticatedUser) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: account }) })
  }) as unknown as ExecutionContext;
function fixture(ids: string, linked = true) {
  const calls: unknown[] = [];
  const prisma = {
    userAuthIdentity: {
      findFirst: async (query: unknown) => {
        calls.push(query);
        return linked ? { id: "linked-identity" } : null;
      }
    }
  } as unknown as PrismaService;
  const access = new RewardsAccessService(
    prisma,
    new ConfigService<EnvironmentVariables, true>({ DOTA_BOT_ADMIN_IDS: ids })
  );
  return { access, calls, guard: new RewardsAdminGuard(access) };
}

describe("Scoped rewards administration", () => {
  it("keeps access for existing website administrators", async () => {
    const { guard, calls } = fixture("");
    assert.equal(await guard.canActivate(context(user("ADMIN"))), true);
    assert.equal(calls.length, 0);
  });
  it("grants bot administrators only through their authenticated Telegram identity", async () => {
    const { guard, calls } = fixture("1054912758, 632528948");
    const account = user();
    assert.equal(await guard.canActivate(context(account)), true);
    assert.deepEqual(calls, [
      {
        where: {
          userId: account.id,
          provider: "telegram",
          providerUserId: { in: ["1054912758", "632528948"] }
        },
        select: { id: true }
      }
    ]);
    assert.equal(account.role, "USER");
    assert.throws(
      () => new AdminGuard().canActivate(context(account)),
      (error: unknown) => (error as { getStatus(): number }).getStatus() === 403
    );
  });
  it("denies other users and unauthenticated requests", async () => {
    const { guard } = fixture("632528948", false);
    await assert.rejects(guard.canActivate(context(user())), { status: 403 });
    await assert.rejects(guard.canActivate(context()), { status: 403 });
  });
  it("never grants access from an empty or invalid administrator list", async () => {
    const { guard, calls } = fixture("0,invalid,-123");
    await assert.rejects(guard.canActivate(context(user())), { status: 403 });
    assert.equal(calls.length, 0);
  });
  it("requires JWT authentication before every rewards admin route", () => {
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AdminRewardsController), [
      JwtAuthGuard,
      RewardsAdminGuard
    ]);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, RewardsController), [JwtAuthGuard]);
  });
});
