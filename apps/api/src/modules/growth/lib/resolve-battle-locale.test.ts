import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveBattleLocale } from "./resolve-battle-locale.js";
import { resolveTopLocale } from "../../tops/lib/resolve-top-locale.js";

describe("resolveTopLocale", () => {
  it("uses explicit locale when provided", () => {
    assert.equal(resolveTopLocale("en", "Топ", null), "en");
  });

  it("infers ru from cyrillic title", () => {
    assert.equal(resolveTopLocale(undefined, "Лучшие VPN", null), "ru");
  });

  it("infers en from latin title", () => {
    assert.equal(resolveTopLocale(undefined, "Best VPN", null), "en");
  });
});

describe("resolveBattleLocale", () => {
  it("defaults to ru when locale is missing", () => {
    assert.equal(resolveBattleLocale(undefined), "ru");
  });

  it("keeps explicit en locale", () => {
    assert.equal(resolveBattleLocale("en"), "en");
  });
});
