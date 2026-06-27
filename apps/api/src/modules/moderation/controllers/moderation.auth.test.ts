import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "reflect-metadata";

import { AdminGuard } from "../../auth/guards/admin.guard.js";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { ModerationController } from "./moderation.controller.js";

describe("Moderation authorization", () => {
  it("requires JWT and admin role for moderation endpoints", () => {
    const controllerGuards = Reflect.getMetadata("__guards__", ModerationController);

    assert.ok(controllerGuards?.some((guard: unknown) => guard === JwtAuthGuard));
    assert.ok(controllerGuards?.some((guard: unknown) => guard === AdminGuard));
  });
});
