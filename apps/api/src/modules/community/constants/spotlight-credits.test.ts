import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SPOTLIGHT_EXPIRY_RETENTION_RATE,
  SPOTLIGHT_MONTHLY_GRANTS,
  SPOTLIGHT_SPEND_COSTS
} from "../constants/spotlight-credits.js";

describe("spotlight credits constants", () => {
  it("grants increase with contribution level", () => {
    assert.ok(SPOTLIGHT_MONTHLY_GRANTS.contributor > SPOTLIGHT_MONTHLY_GRANTS.newcomer);
    assert.ok(SPOTLIGHT_MONTHLY_GRANTS.active_contributor > SPOTLIGHT_MONTHLY_GRANTS.contributor);
    assert.ok(SPOTLIGHT_MONTHLY_GRANTS.curator > SPOTLIGHT_MONTHLY_GRANTS.active_contributor);
    assert.ok(SPOTLIGHT_MONTHLY_GRANTS.pioneer > SPOTLIGHT_MONTHLY_GRANTS.curator);
  });

  it("lets contributor afford one minimum entity spotlight per month", () => {
    assert.ok(SPOTLIGHT_MONTHLY_GRANTS.contributor >= SPOTLIGHT_SPEND_COSTS.entity_spotlight);
  });

  it("keeps spend costs aligned with RFC sinks", () => {
    assert.equal(SPOTLIGHT_SPEND_COSTS.entity_spotlight, 10);
    assert.equal(SPOTLIGHT_SPEND_COSTS.battle_boost, 15);
    assert.equal(SPOTLIGHT_SPEND_COSTS.top_highlight, 20);
  });

  it("retains half of unused balance across months", () => {
    assert.equal(SPOTLIGHT_EXPIRY_RETENTION_RATE, 0.5);
  });
});
