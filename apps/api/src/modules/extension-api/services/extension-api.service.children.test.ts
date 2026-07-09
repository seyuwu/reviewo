import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityType } from "#prisma/client";

import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import type { ReputationDisplayService } from "../../reputation/services/reputation-display.service.js";
import type { UrlNormalizer } from "../../entities/interfaces/url-normalizer.js";
import { ExtensionApiService } from "./extension-api.service.js";
import { RateSiteUseCase } from "../use-cases/rate-site.use-case.js";

const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";

const childEntity = {
  canonicalUrl: "https://tree.example/page",
  createdAt: "2026-06-27T00:00:00.000Z",
  createdBy: parentId,
  description: null,
  logoUrl: null,
  id: childId,
  parentId,
  slug: "tree-example-page",
  title: "Tree page",
  type: EntityType.website,
  updatedAt: "2026-06-27T00:00:00.000Z",
  visibility: "ACTIVE" as const
};

describe("ExtensionApiService.listEntityChildren", () => {
  it("returns child entities with rating aggregates", async () => {
    const entitiesPort: EntitiesPort = {
      ensureEntityForUrl: async () => {
        throw new Error("not used");
      },
      findEntityById: async () => childEntity,
      findEntityBySlug: async () => childEntity,
      hideEntity: async () => childEntity,
      listChildEntities: async () => [childEntity],
      resolveEntityByUrl: async () => ({
        canonicalUrl: "https://tree.example/",
        entity: null,
        inputUrl: "https://tree.example/",
        resolution: "not_found"
      }),
      searchEntities: async () => [],
      searchEntitiesRanked: async () => [],
      unhideEntity: async () => childEntity
    };
    const ratingsPort: RatingsPort = {
      getAggregate: async () => ({
        avgScore: 4.5,
        distribution: {
          "1": 0,
          "2": 0,
          "3": 0,
          "4": 1,
          "5": 0
        },
        entityId: childId,
        updatedAt: "2026-06-27T00:00:00.000Z",
        votesCount: 12
      }),
      rateEntity: async () => {
        throw new Error("not used");
      }
    };
    const service = new ExtensionApiService(
      entitiesPort,
      ratingsPort,
      { getSiteRootCanonicalUrl: (url: string) => url } as UrlNormalizer,
      {
        resolveEntityTrustConfidence: async () => ({ confidence: 0.5 })
      } as unknown as ReputationDisplayService,
      {} as RateSiteUseCase
    );

    const result = await service.listEntityChildren(parentId, 20);

    assert.equal(result.parentId, parentId);
    assert.equal(result.children.length, 1);
    assert.equal(result.children[0]?.entity.id, childId);
    assert.equal(result.children[0]?.rating.votesCount, 12);
    assert.equal(result.children[0]?.web.entityPagePath, `/entities/${childId}`);
  });
});
