import assert from "node:assert/strict";
import test from "node:test";

import {
  DOTA_PARTY_INVITE_TTL_HOURS,
  DOTA_TEMP_PARTY_EXTEND_HOURS,
  DOTA_TEMP_PARTY_MAX_LIFETIME_HOURS,
  DOTA_TEMP_PARTY_TTL_HOURS
} from "./game-party.ts";

test("party invite TTL is 3 hours", () => {
  assert.equal(DOTA_PARTY_INVITE_TTL_HOURS, 3);
});

test("temp party TTL remains 3 hours", () => {
  assert.equal(DOTA_TEMP_PARTY_TTL_HOURS, 3);
});

test("temp party extend and max lifetime stay aligned", () => {
  assert.equal(DOTA_TEMP_PARTY_EXTEND_HOURS, 3);
  assert.equal(DOTA_TEMP_PARTY_MAX_LIFETIME_HOURS, 12);
});

test("team discord voice TTL is 6 hours", async () => {
  const {
    DOTA_TEAM_DISCORD_VOICE_EXTEND_HOURS,
    DOTA_TEAM_DISCORD_VOICE_MAX_LIFETIME_HOURS,
    DOTA_TEAM_DISCORD_VOICE_TTL_HOURS
  } = await import("./game-party.ts");
  assert.equal(DOTA_TEAM_DISCORD_VOICE_TTL_HOURS, 6);
  assert.equal(DOTA_TEAM_DISCORD_VOICE_EXTEND_HOURS, 6);
  assert.equal(DOTA_TEAM_DISCORD_VOICE_MAX_LIFETIME_HOURS, 24);
});
