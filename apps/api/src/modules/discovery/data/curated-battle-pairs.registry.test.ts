import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getCuratedBattlePairDefinitions,
  loadAiToolsVerticalRegistry,
  resetCuratedBattlePairsCacheForTests,
  resolveAiToolsVerticalRegistryPath
} from "./curated-battle-pairs.registry.js";

describe("curated-battle-pairs.registry", () => {
  it("loads the AI tools registry from prisma/seeds", () => {
    resetCuratedBattlePairsCacheForTests();

    const registry = loadAiToolsVerticalRegistry();

    assert.equal(registry.vertical, "ai-tools");
    assert.equal(registry.entities.length, 30);
    assert.equal(registry.curatedBattles.length, 18);
  });

  it("exposes ordered curated battle slug pairs", () => {
    resetCuratedBattlePairsCacheForTests();

    const pairs = getCuratedBattlePairDefinitions();

    assert.equal(pairs.length, 18);
    assert.equal(pairs[0]?.leftSlug, "claude");
    assert.equal(pairs[0]?.rightSlug, "chatgpt");
    assert.equal(pairs[1]?.leftSlug, "cursor");
    assert.equal(pairs[1]?.rightSlug, "windsurf");
  });

  it("uses unique entity slugs in the registry", () => {
    resetCuratedBattlePairsCacheForTests();

    const registry = loadAiToolsVerticalRegistry();
    const slugs = registry.entities.map((entity) => entity.slug);

    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("resolves registry path under apps/api/prisma/seeds", () => {
    const registryPath = resolveAiToolsVerticalRegistryPath();

    assert.match(registryPath, /prisma[\\/]+seeds[\\/]+ai-tools-vertical\.registry\.json$/);
  });
});
