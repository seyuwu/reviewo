import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const requiredRouteFiles = [
  "src/app/page.tsx",
  "src/app/entities/new/page.tsx",
  "src/app/entities/[entityId]/page.tsx",
  "src/app/profile/page.tsx",
  "src/app/compare/[pairSlug]/page.tsx",
  "src/app/battle/[pairSlug]/page.tsx",
  "src/app/embed/entities/[entityId]/page.tsx",
  "src/app/og/entity/[entityId]/route.tsx"
];

describe("Web route smoke", () => {
  for (const routeFile of requiredRouteFiles) {
    it(`includes route file ${routeFile}`, async () => {
      await access(join(webRoot, routeFile));
      assert.ok(true);
    });
  }
});
