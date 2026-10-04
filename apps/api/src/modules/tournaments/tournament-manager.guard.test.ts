import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";

import { AdminGuard } from "../auth/guards/admin.guard.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { AdminUsersController } from "../auth/controllers/admin-users.controller.js";
import { AdminDotaTournamentsController } from "./tournaments-admin.controller.js";
import { TournamentManagerGuard } from "./tournament-manager.guard.js";

describe("Tournament moderator authorization", () => {
  it("allows tournament moderators and admins, but not regular users", () => {
    const guard = new TournamentManagerGuard();

    assert.equal(guard.canActivate(contextFor("TOURNAMENT_MODERATOR")), true);
    assert.equal(guard.canActivate(contextFor("ADMIN")), true);
    assert.throws(() => guard.canActivate(contextFor("USER")));
    assert.throws(() => guard.canActivate(contextFor(undefined)));
  });

  it("keeps tournament administration separate from general admin routes", () => {
    const tournamentGuards = Reflect.getMetadata("__guards__", AdminDotaTournamentsController);
    const userRoleGuards = Reflect.getMetadata("__guards__", AdminUsersController);

    assert.ok(tournamentGuards?.includes(JwtAuthGuard));
    assert.ok(tournamentGuards?.includes(TournamentManagerGuard));
    assert.equal(tournamentGuards?.includes(AdminGuard), false);
    assert.ok(userRoleGuards?.includes(JwtAuthGuard));
    assert.ok(userRoleGuards?.includes(AdminGuard));
  });

  it("does not let a tournament moderator through the general AdminGuard", () => {
    assert.throws(() => new AdminGuard().canActivate(contextFor("TOURNAMENT_MODERATOR")));
  });
});

function contextFor(role: "ADMIN" | "TOURNAMENT_MODERATOR" | "USER" | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) })
  } as unknown as ExecutionContext;
}
