import assert from "node:assert/strict";
import test from "node:test";

import { DOTA_PARTY_INVITE_TTL_HOURS, DOTA_TEMP_PARTY_TTL_HOURS } from "./game-party.ts";

test("party invite TTL is 3 hours", () => {
  assert.equal(DOTA_PARTY_INVITE_TTL_HOURS, 3);
});

test("temp party TTL remains 12 hours", () => {
  assert.equal(DOTA_TEMP_PARTY_TTL_HOURS, 12);
});
