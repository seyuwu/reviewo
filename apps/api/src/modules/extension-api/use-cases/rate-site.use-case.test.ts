import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityType } from "@prisma/client";

import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { RateSiteUseCase } from "./rate-site.use-case.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import type { TrustPort } from "../../trust/interfaces/trust.port.js";

const currentUser: AuthenticatedUser = {
  displayName: "Tester",
  email: "tester@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  status: "active",
  username: null
};

const entity = {
  canonicalUrl: "https://rate-site.example/",
  createdAt: "2026-06-27T00:00:00.000Z",
  createdBy: currentUser.id,
  description: null,
  id: "22222222-2222-4222-8222-222222222222",
  parentId: null,
  slug: "rate-site-example",
  title: "rate-site.example",
  type: EntityType.website,
  updatedAt: "2026-06-27T00:00:00.000Z"
};

describe("RateSiteUseCase", () => {
  it("ensures entity by URL before rating", async () => {
    const calls: string[] = [];
    const entitiesPort: EntitiesPort = {
      ensureEntityForUrl: async () => {
        calls.push("ensure");
        return {
          entity,
          mode: "created"
        };
      },
      findEntityById: async () => entity,
      resolveEntityByUrl: async () => ({
        canonicalUrl: "https://rate-site.example/",
        entity: null,
        inputUrl: "https://rate-site.example/"
      }),
      searchEntities: async () => []
    };
    const ratingsPort: RatingsPort = {
      getAggregate: async () => {
        throw new Error("not used");
      },
      rateEntity: async () => {
        calls.push("rate");
        return {
          aggregate: {
            avgScore: 4,
            distribution: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 0 },
            entityId: entity.id,
            updatedAt: "2026-06-27T00:00:00.000Z",
            votesCount: 1
          },
          rating: {
            createdAt: "2026-06-27T00:00:00.000Z",
            entityId: entity.id,
            score: 4,
            source: "web",
            updatedAt: "2026-06-27T00:00:00.000Z",
            userId: currentUser.id
          }
        };
      }
    };
    const trustPort: TrustPort = {
      getEntityTrust: async () => ({
        confidence: 0.01
      })
    };

    const useCase = new RateSiteUseCase(entitiesPort, ratingsPort, trustPort);
    const result = await useCase.execute(
      {
        score: 4,
        sourceTitle: "Rate Site",
        url: "https://rate-site.example/"
      },
      currentUser
    );

    assert.deepEqual(calls, ["ensure", "rate"]);
    assert.equal(result.entityProvision.mode, "created");
    assert.equal(result.myRating.score, 4);
    assert.equal(result.url.canonical, "https://rate-site.example/");
  });

  it("reuses existing entity for known URL", async () => {
    const entitiesPort: EntitiesPort = {
      ensureEntityForUrl: async () => ({
        entity,
        mode: "existing"
      }),
      findEntityById: async () => entity,
      resolveEntityByUrl: async () => ({
        canonicalUrl: "https://rate-site.example/",
        entity,
        inputUrl: "https://rate-site.example/"
      }),
      searchEntities: async () => []
    };
    const ratingsPort: RatingsPort = {
      getAggregate: async () => {
        throw new Error("not used");
      },
      rateEntity: async () => ({
        aggregate: {
          avgScore: 5,
          distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
          entityId: entity.id,
          updatedAt: "2026-06-27T00:00:00.000Z",
          votesCount: 1
        },
        rating: {
          createdAt: "2026-06-27T00:00:00.000Z",
          entityId: entity.id,
          score: 5,
          source: "web",
          updatedAt: "2026-06-27T00:00:00.000Z",
          userId: currentUser.id
        }
      })
    };
    const trustPort: TrustPort = {
      getEntityTrust: async () => ({
        confidence: 0.01
      })
    };

    const useCase = new RateSiteUseCase(entitiesPort, ratingsPort, trustPort);
    const result = await useCase.execute(
      {
        score: 5,
        url: "https://rate-site.example/"
      },
      currentUser
    );

    assert.equal(result.entityProvision.mode, "existing");
    assert.equal(result.entity.id, entity.id);
  });
});
