import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityType } from "#prisma/client";

import type { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { RatingsRepository } from "../repositories/ratings.repository.js";
import { RatingsService } from "./ratings.service.js";

const currentUser: AuthenticatedUser = {
  displayName: "Tester",
  email: "tester@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  role: "USER",
  status: "active",
  username: null
};

const entity = {
  canonicalUrl: "https://ratings.example/",
  createdAt: "2026-06-27T00:00:00.000Z",
  createdBy: currentUser.id,
  description: null,
  logoUrl: null,
  id: "22222222-2222-4222-8222-222222222222",
  parentId: null,
  slug: "ratings-example",
  title: "ratings.example",
  type: EntityType.website,
  updatedAt: "2026-06-27T00:00:00.000Z",
  visibility: "ACTIVE" as const
};

function createAggregate() {
  return {
    avgScore: 4,
    distribution1: 0,
    distribution2: 0,
    distribution3: 0,
    distribution4: 1,
    distribution5: 0,
    entityId: entity.id,
    updatedAt: new Date("2026-06-27T00:00:00.000Z"),
    votesCount: 1
  };
}

function createRating(score: number) {
  return {
    createdAt: new Date("2026-06-27T00:00:00.000Z"),
    entityId: entity.id,
    id: "33333333-3333-4333-8333-333333333333",
    score,
    source: "web",
    updatedAt: new Date("2026-06-27T00:00:00.000Z"),
    userId: currentUser.id
  };
}

describe("RatingsService", () => {
  it("rejects rating when entity is not publicly available", async () => {
    const entitiesPort: EntitiesPort = {
      ensureEntityForUrl: async () => {
        throw new Error("not used");
      },
      findEntityById: async () => null,
      findEntityBySlug: async () => null,
      hideEntity: async () => entity,
      listChildEntities: async () => [],
      resolveEntityByUrl: async () => ({
        canonicalUrl: entity.canonicalUrl!,
        entity: null,
        inputUrl: entity.canonicalUrl!,
        resolution: "not_found"
      }),
      searchEntities: async () => [],
      searchEntitiesRanked: async () => [],
      unhideEntity: async () => entity
    };
    const service = new RatingsService(
      entitiesPort,
      { publish: async () => undefined } as unknown as DomainEventBus,
      {} as RatingsRepository
    );

    await assert.rejects(() => service.rateEntity(entity.id, { score: 4 }, currentUser));
  });

  it("publishes RatingCreated on first rating", async () => {
    const published: string[] = [];
    const entitiesPort: EntitiesPort = {
      ensureEntityForUrl: async () => {
        throw new Error("not used");
      },
      findEntityById: async () => entity,
      findEntityBySlug: async () => entity,
      hideEntity: async () => entity,
      listChildEntities: async () => [],
      resolveEntityByUrl: async () => ({
        canonicalUrl: entity.canonicalUrl!,
        entity,
        inputUrl: entity.canonicalUrl!,
        resolution: "found"
      }),
      searchEntities: async () => [],
      searchEntitiesRanked: async () => [],
      unhideEntity: async () => entity
    };
    const repository = {
      runInTransaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({}),
      findUserRating: async () => null,
      upsertRating: async () => createRating(4),
      recalculateAggregate: async () => createAggregate()
    } as unknown as RatingsRepository;
    const eventBus = {
      publish: async (event: { name: string }) => {
        published.push(event.name);
      }
    } as unknown as DomainEventBus;
    const service = new RatingsService(entitiesPort, eventBus, repository);

    const result = await service.rateEntity(entity.id, { score: 4 }, currentUser);

    assert.deepEqual(published, ["rating.created"]);
    assert.equal(result.rating.score, 4);
    assert.equal(result.aggregate.votesCount, 1);
  });

  it("publishes RatingUpdated on repeated rating", async () => {
    const published: string[] = [];
    const entitiesPort: EntitiesPort = {
      ensureEntityForUrl: async () => {
        throw new Error("not used");
      },
      findEntityById: async () => entity,
      findEntityBySlug: async () => entity,
      hideEntity: async () => entity,
      listChildEntities: async () => [],
      resolveEntityByUrl: async () => ({
        canonicalUrl: entity.canonicalUrl!,
        entity,
        inputUrl: entity.canonicalUrl!,
        resolution: "found"
      }),
      searchEntities: async () => [],
      searchEntitiesRanked: async () => [],
      unhideEntity: async () => entity
    };
    const repository = {
      runInTransaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({}),
      findUserRating: async () => createRating(3),
      upsertRating: async () => createRating(5),
      recalculateAggregate: async () => ({
        ...createAggregate(),
        avgScore: 5
      })
    } as unknown as RatingsRepository;
    const eventBus = {
      publish: async (event: { name: string }) => {
        published.push(event.name);
      }
    } as unknown as DomainEventBus;
    const service = new RatingsService(entitiesPort, eventBus, repository);

    const result = await service.rateEntity(entity.id, { score: 5 }, currentUser);

    assert.deepEqual(published, ["rating.updated"]);
    assert.equal(result.rating.score, 5);
  });
});
