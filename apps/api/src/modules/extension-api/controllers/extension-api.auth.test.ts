import "reflect-metadata";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard.js";
import { ExtensionApiController } from "./extension-api.controller.js";

describe("Extension rating authorization", () => {
  it("requires JWT for by-url rating endpoint", () => {
    const routeGuards = Reflect.getMetadata(
      "__guards__",
      ExtensionApiController.prototype.rateSiteByUrl
    );

    assert.ok(routeGuards?.some((guard: unknown) => guard === JwtAuthGuard));
  });
});
