import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ExtensionResolveFoundResponse, ExtensionResolveResponse } from "../shared/types/resolve.js";
import {
  isEntityTrustedForBadge,
  isTrustReliableEnough,
  resolveActionBadgeState
} from "./action-badge.js";

function buildFoundResolve(
  overrides: Partial<{
    avgScore: number;
    confidence: number;
    dataReliability: number;
    manipulationRisk: number;
    reliabilityLevel: ExtensionResolveFoundResponse["trust"]["reliabilityLevel"];
    votesCount: number;
  }> = {}
): ExtensionResolveResponse {
  return {
    entity: {
      canonicalUrl: "https://github.com/repo",
      description: null,
      id: "11111111-1111-4111-8111-111111111111",
      slug: "github-com-repo",
      title: "GitHub Repo",
      type: "website"
    },
    rating: {
      avgScore: overrides.avgScore ?? 4.2,
      entityId: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-06-27T00:00:00.000Z",
      votesCount: overrides.votesCount ?? 12
    },
    status: "found",
    trust: {
      confidence: overrides.confidence ?? 0.9,
      ...(overrides.dataReliability !== undefined ? { dataReliability: overrides.dataReliability } : {}),
      ...(overrides.manipulationRisk !== undefined ? { manipulationRisk: overrides.manipulationRisk } : {}),
      ...(overrides.reliabilityLevel !== undefined ? { reliabilityLevel: overrides.reliabilityLevel } : {})
    },
    url: {
      canonical: "https://github.com/repo",
      input: "https://github.com/repo"
    },
    web: {
      entityPagePath: "/entities/11111111-1111-4111-8111-111111111111"
    }
  };
}

const notFoundResolve: ExtensionResolveResponse = {
  canCreateEntity: true,
  status: "not_found",
  url: {
    canonical: "https://example.com/new",
    input: "https://example.com/new"
  }
};

describe("resolveActionBadgeState", () => {
  it("returns hidden for non-resolvable and opinia web pages", () => {
    const foundResolve = buildFoundResolve();

    assert.equal(resolveActionBadgeState("chrome://newtab", foundResolve), "hidden");
    assert.equal(resolveActionBadgeState("http://localhost:3001/entities", foundResolve), "hidden");
    assert.equal(resolveActionBadgeState(null, foundResolve), "hidden");
  });

  it("returns unknown for not_found resolve", () => {
    assert.equal(resolveActionBadgeState("https://example.com/new", notFoundResolve), "unknown");
  });

  it("returns trusted for strong ratings and reliability", () => {
    assert.equal(
      resolveActionBadgeState("https://github.com/repo", buildFoundResolve()),
      "trusted"
    );
  });

  it("returns insufficient when there are not enough votes", () => {
    assert.equal(
      resolveActionBadgeState("https://youtube.com/watch?v=abc", buildFoundResolve({ votesCount: 0 })),
      "insufficient"
    );
    assert.equal(
      resolveActionBadgeState("https://youtube.com/watch?v=abc", buildFoundResolve({ votesCount: 2 })),
      "insufficient"
    );
  });

  it("returns insufficient for weak average score or low trust", () => {
    assert.equal(
      resolveActionBadgeState("https://github.com/repo", buildFoundResolve({ avgScore: 2.8 })),
      "insufficient"
    );
    assert.equal(
      resolveActionBadgeState("https://github.com/repo", buildFoundResolve({ confidence: 0.55 })),
      "insufficient"
    );
    assert.equal(
      resolveActionBadgeState(
        "https://github.com/repo",
        buildFoundResolve({ manipulationRisk: 0.8, confidence: 0.9 })
      ),
      "insufficient"
    );
  });
});

describe("isEntityTrustedForBadge", () => {
  it("requires high or very_high reliability", () => {
    const foundResolve = buildFoundResolve({ confidence: 0.9, reliabilityLevel: "high" });

    assert.equal(isEntityTrustedForBadge(foundResolve as ExtensionResolveFoundResponse), true);
    assert.equal(
      isEntityTrustedForBadge(
        buildFoundResolve({ confidence: 0.7, reliabilityLevel: "medium" }) as ExtensionResolveFoundResponse
      ),
      false
    );
  });
});

describe("isTrustReliableEnough", () => {
  it("accepts high confidence levels", () => {
    assert.equal(isTrustReliableEnough({ confidence: 0.95, reliabilityLevel: "very_high" }), true);
    assert.equal(isTrustReliableEnough({ confidence: 0.82 }), true);
    assert.equal(isTrustReliableEnough({ confidence: 0.5 }), false);
  });
});
