import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isGenericEntityTitle, resolveCardDisplayTitle } from "./card-page-title.js";

describe("card page title", () => {
  it("prefers the live page title for not_found resolve responses", () => {
    assert.equal(
      resolveCardDisplayTitle(
        {
          canCreateEntity: true,
          status: "not_found",
          url: {
            canonical: "https://youtube.com/watch?v=abc",
            input: "https://www.youtube.com/watch?v=abc"
          }
        },
        "Example video title - YouTube"
      ),
      "Example video title - YouTube"
    );
  });

  it("uses the page title when the stored entity title is generic", () => {
    assert.equal(
      resolveCardDisplayTitle(
        {
          entity: {
            canonicalUrl: "https://youtube.com/watch?v=abc",
            description: null,
            id: "entity-1",
            slug: "watch-v-abc",
            title: "youtube.com",
            type: "website"
          },
          rating: {
            avgScore: 4,
            entityId: "entity-1",
            updatedAt: "2026-01-01T00:00:00.000Z",
            votesCount: 2
          },
          status: "found",
          trust: {
            confidence: 0.5
          },
          url: {
            canonical: "https://youtube.com/watch?v=abc",
            input: "https://www.youtube.com/watch?v=abc"
          },
          web: {
            entityPagePath: "/entities/entity-1"
          }
        },
        "Real video title - YouTube"
      ),
      "Real video title - YouTube"
    );
  });

  it("treats hostname-only entity titles as generic", () => {
    assert.equal(isGenericEntityTitle("youtube.com", "https://youtube.com/watch?v=abc"), true);
    assert.equal(isGenericEntityTitle("youtube", "https://youtube.com/watch?v=abc"), true);
    assert.equal(
      isGenericEntityTitle("A real video title", "https://youtube.com/watch?v=abc"),
      false
    );
  });
});
