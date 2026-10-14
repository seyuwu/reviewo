import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseWinners, containsTag, moscowDay, moscowWeek } from "./rewards.rules.js";
describe("Reward rules", () => {
  it("uses the Moscow day across midnight", () => {
    assert.equal(moscowDay(new Date("2026-10-13T20:59:59Z")), "2026-10-13");
    assert.equal(moscowDay(new Date("2026-10-13T21:00:00Z")), "2026-10-14");
    assert.equal(moscowWeek(new Date("2026-10-18T21:00:00Z")), "2026-10-19");
  });
  it("accepts exact tags case-insensitively and rejects lookalikes", () => {
    assert.equal(containsTag("Марина @fdpdotabot", "@FDPdotabot"), true);
    for (const name of [
      "@FDPdotabot_fake",
      "@FDPdotabot2",
      "@@FDPdotabot",
      "name@FDPdotabot",
      "@FDPdоtabot"
    ])
      assert.equal(containsTag(name, "@FDPdotabot"), false);
  });
  it("weights by tickets and excludes all tickets of a unique winner", () => {
    const tickets = [
      { telegramId: "1", number: 1 },
      { telegramId: "1", number: 2 },
      { telegramId: "2", number: 3 }
    ];
    assert.deepEqual(
      chooseWinners(tickets, 3, true, () => 0).map((t) => t.number),
      [1, 3]
    );
    assert.deepEqual(
      chooseWinners(tickets, 3, false, () => 0).map((t) => t.number),
      [1, 2, 3]
    );
    assert.deepEqual(chooseWinners([], 3, true), []);
  });
});
