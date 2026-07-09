import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityType } from "#prisma/client";

import type { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { EntitiesRepository } from "../repositories/entities.repository.js";
import { EntitiesService } from "./entities.service.js";
import type { UrlNormalizer } from "../interfaces/url-normalizer.js";

const currentUser: AuthenticatedUser = {
  displayName: "Tester",
  email: "tester@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  role: "USER",
  status: "active",
  username: null
};

function createEntity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    canonicalUrl: "https://lazy-create.example/",
    createdAt: new Date("2026-06-27T00:00:00.000Z"),
    createdBy: currentUser.id,
    description: null,
    logoUrl: null,
    id: "22222222-2222-4222-8222-222222222222",
    parentId: null,
    slug: "lazy-create-example",
    title: "lazy-create.example",
    type: EntityType.website,
    updatedAt: new Date("2026-06-27T00:00:00.000Z"),
    visibility: "ACTIVE",
    ...overrides
  };
}

describe("EntitiesService.ensureEntityForUrl", () => {
  it("returns existing entity without creating a duplicate", async () => {
    const existing = createEntity();
    const repository = {
      create: async () => {
        throw new Error("create should not be called");
      },
      findByCanonicalUrl: async () => existing,
      isUniqueConstraintError: () => false
    } as unknown as EntitiesRepository;
    const urlNormalizer: UrlNormalizer = {
      normalize: (input) => input,
      getSiteRootCanonicalUrl: (canonicalUrl) => new URL(canonicalUrl).origin + "/"
    };
    const eventBus = { publish: async () => undefined } as unknown as DomainEventBus;
    const service = new EntitiesService(repository, eventBus, urlNormalizer);

    const result = await service.ensureEntityForUrl(
      "https://lazy-create.example/",
      {},
      currentUser
    );

    assert.equal(result.mode, "existing");
    assert.equal(result.entity.id, existing.id);
  });

  it("creates entity for unknown URL on first rating", async () => {
    let created = false;
    const createdEntity = createEntity();
    const repository = {
      create: async () => {
        created = true;
        return createdEntity;
      },
      findByCanonicalUrl: async () => null,
      isUniqueConstraintError: () => false
    } as unknown as EntitiesRepository;
    const urlNormalizer: UrlNormalizer = {
      normalize: (input) => input,
      getSiteRootCanonicalUrl: (canonicalUrl) => new URL(canonicalUrl).origin + "/"
    };
    const eventBus = { publish: async () => undefined } as unknown as DomainEventBus;
    const service = new EntitiesService(repository, eventBus, urlNormalizer);

    const result = await service.ensureEntityForUrl(
      "https://lazy-create.example/",
      {
        sourceTitle: "Lazy Create"
      },
      currentUser
    );

    assert.equal(created, true);
    assert.equal(result.mode, "created");
    assert.equal(result.entity.title, createdEntity.title);
  });

  it("reuses entity after concurrent canonical URL conflict", async () => {
    const existing = createEntity();
    let lookupCount = 0;
    const repository = {
      create: async () => {
        const error = { code: "P2002" };
        throw error;
      },
      findByCanonicalUrl: async () => {
        lookupCount += 1;
        return lookupCount === 1 ? null : existing;
      },
      isUniqueConstraintError: (error: unknown) =>
        typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
    } as unknown as EntitiesRepository;
    const urlNormalizer: UrlNormalizer = {
      normalize: (input) => input,
      getSiteRootCanonicalUrl: (canonicalUrl) => new URL(canonicalUrl).origin + "/"
    };
    const eventBus = { publish: async () => undefined } as unknown as DomainEventBus;
    const service = new EntitiesService(repository, eventBus, urlNormalizer);

    const result = await service.ensureEntityForUrl(
      "https://lazy-create.example/",
      {},
      currentUser
    );

    assert.equal(result.mode, "existing");
    assert.equal(result.entity.id, existing.id);
  });
});
