import assert from "node:assert/strict";
import test from "node:test";

import { isValidTopSlug, slugifyTopTitle } from "./top-limits.ts";

test("slugifyTopTitle transliterates cyrillic titles", () => {
  assert.equal(slugifyTopTitle("Лучшие AI инструменты"), "luchshie-ai-instrumenty");
  assert.equal(slugifyTopTitle("Топ YouTube каналов"), "top-youtube-kanalov");
});

test("slugifyTopTitle keeps latin titles readable", () => {
  assert.equal(slugifyTopTitle("Best AI Tools 2026"), "best-ai-tools-2026");
});

test("isValidTopSlug rejects reserved system prefix", () => {
  assert.equal(isValidTopSlug("system-top"), false);
  assert.equal(isValidTopSlug("best-ai-tools"), true);
});
