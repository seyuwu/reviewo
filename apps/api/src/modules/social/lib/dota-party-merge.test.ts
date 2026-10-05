import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planDotaPartyMerge, type DotaPartyMergeCandidate } from "./dota-party-merge.js";

const now = new Date("2026-09-27T12:00:00.000Z");

function party(
  id: string,
  slots: Array<[string, string | null]>,
  options: Partial<DotaPartyMergeCandidate> = {}
): DotaPartyMergeCandidate {
  return {
    createdAt: new Date(`2026-09-${id === "older" ? "26" : "27"}T10:00:00.000Z`),
    discordChannelId: null,
    expiresAt: new Date("2026-09-27T14:00:00.000Z"),
    id,
    joinMode: "OPEN",
    lfgUntil: new Date("2026-09-27T12:20:00.000Z"),
    maxMembers: 5,
    members: slots.map(([userId, positionRole]) => ({ positionRole, userId })),
    mmrBounds: slots.map(() => ({ high: 3000, low: 3000 })),
    ownerUserId: slots[0]?.[0] ?? `${id}-captain`,
    pendingInviteCount: 0,
    recruitedRoles: ["1", "2", "3", "4", "5"],
    servers: ["EU"],
    slug: `${id}-party`,
    ...options
  };
}

describe("planDotaPartyMerge", () => {
  it("does not return a former member through a merge, in either direction", () => {
    const older = party("older", [["a", "1"]], { blockedUserIds: ["b"] });
    const newer = party("newer", [["b", "2"]]);
    assert.equal(planDotaPartyMerge(older, newer, now), null);
    assert.equal(planDotaPartyMerge(newer, older, now), null);
    assert.equal(
      planDotaPartyMerge(
        party("older", [["a", "1"]]),
        party("newer", [["b", "2"]], { blockedUserIds: ["a"] }),
        now
      ),
      null
    );
  });

  it("still merges when the excluded player is outside both rosters", () => {
    assert.ok(
      planDotaPartyMerge(
        party("older", [["a", "1"]], { blockedUserIds: ["outsider"] }),
        party("newer", [["b", "2"]]),
        now
      )
    );
  });

  it("merges two and three player parties with distinct occupied roles and searches remaining slots", () => {
    const plan = planDotaPartyMerge(
      party("older", [
        ["a", "1"],
        ["b", "4"]
      ]),
      party("newer", [
        ["c", "2"],
        ["d", "3"],
        ["e", "5"]
      ]),
      now
    );

    assert.deepEqual(plan, {
      leaderCandidates: ["a", "c"],
      recruitedRoles: [],
      survivorPartyId: "older",
      retiredPartyId: "newer",
      retiredPartySlug: "newer-party"
    });
  });

  it("merges two two-player parties and leaves every unoccupied role searchable", () => {
    const plan = planDotaPartyMerge(
      party("older", [
        ["a", "1"],
        ["b", "4"]
      ]),
      party("newer", [
        ["c", "2"],
        ["d", "3"]
      ]),
      now
    );

    assert.deepEqual(plan?.recruitedRoles, ["5"]);
  });

  it("rejects a repeated occupied role instead of colliding slots", () => {
    assert.equal(
      planDotaPartyMerge(
        party("older", [
          ["a", "1"],
          ["b", "4"]
        ]),
        party("newer", [
          ["c", "1"],
          ["d", "3"]
        ]),
        now
      ),
      null
    );
  });

  it("requires each former captain to still be a member before electing either", () => {
    assert.equal(
      planDotaPartyMerge(
        party(
          "older",
          [
            ["a", "1"],
            ["b", "4"]
          ],
          { ownerUserId: "not-a-member" }
        ),
        party("newer", [
          ["c", "2"],
          ["d", "3"]
        ]),
        now
      ),
      null
    );
  });

  it("rejects groups that exceed five members or cannot share an MMR band", () => {
    assert.equal(
      planDotaPartyMerge(
        party("older", [
          ["a", "1"],
          ["b", "4"],
          ["c", "3"]
        ]),
        party("newer", [
          ["d", "2"],
          ["e", "5"],
          ["f", null]
        ]),
        now
      ),
      null
    );
    assert.equal(
      planDotaPartyMerge(
        party(
          "older",
          [
            ["a", "1"],
            ["b", "4"]
          ],
          {
            mmrBounds: [
              { high: 1000, low: 1000 },
              { high: 1000, low: 1000 }
            ]
          }
        ),
        party(
          "newer",
          [
            ["c", "2"],
            ["d", "3"]
          ],
          {
            mmrBounds: [
              { high: 5000, low: 5000 },
              { high: 5000, low: 5000 }
            ]
          }
        ),
        now
      ),
      null
    );
  });

  it("does not merge while either party has pending invitations, a closed join mode, or Discord voice", () => {
    const other = party("newer", [
      ["c", "2"],
      ["d", "3"]
    ]);

    for (const blocked of [
      { pendingInviteCount: 1 },
      { joinMode: "CONFIRM" as const },
      { discordChannelId: "voice-channel" }
    ]) {
      assert.equal(
        planDotaPartyMerge(
          party(
            "older",
            [
              ["a", "1"],
              ["b", "4"]
            ],
            blocked
          ),
          other,
          now
        ),
        null
      );
    }
  });
});
