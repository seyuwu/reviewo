import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityType, EntityVisibility } from "#prisma/client";

import type { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import type { EntitiesRepository } from "../repositories/entities.repository.js";
import { UrlNormalizationService } from "./url-normalization.service.js";
import { EntitiesService } from "./entities.service.js";

function createEntity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    canonicalUrl: "https://trust-check.example/",
    createdAt: new Date("2026-06-28T00:00:00.000Z"),
    createdBy: null,
    description: null,
    id: "33333333-3333-4333-8333-333333333333",
    parentId: null,
    slug: "trust-check-example",
    title: "trust-check.example",
    type: EntityType.website,
    updatedAt: new Date("2026-06-28T00:00:00.000Z"),
    visibility: EntityVisibility.ACTIVE,
    ...overrides
  };
}

function createService(repository: EntitiesRepository, events: unknown[] = []) {
  const eventBus = {
    publish: async (event: unknown) => {
      events.push(event);
    }
  } as unknown as DomainEventBus;

  return new EntitiesService(repository, eventBus, new UrlNormalizationService());
}

describe("EntitiesService.trustCheckUrl", () => {
  it("returns an existing entity without creating a duplicate", async () => {
    const existing = createEntity();
    const repository = {
      create: async () => {
        throw new Error("create should not be called");
      },
      findByCanonicalUrl: async () => existing,
      isUniqueConstraintError: () => false
    } as unknown as EntitiesRepository;
    const service = createService(repository);

    const result = await service.trustCheckUrl("https://trust-check.example/?utm_source=test");

    assert.equal(result.mode, "existing");
    assert.equal(result.entity.id, existing.id);
    assert.equal(result.url.canonical, "https://trust-check.example/");
  });

  it("creates an unrated public website entity for an unknown valid URL", async () => {
    const events: unknown[] = [];
    const createdEntity = createEntity();
    let createInput: unknown;
    const repository = {
      create: async (input: unknown) => {
        createInput = input;
        return createdEntity;
      },
      findByCanonicalUrl: async () => null,
      findBySlug: async () => null,
      isUniqueConstraintError: () => false
    } as unknown as EntitiesRepository;
    const service = createService(repository, events);

    const result = await service.trustCheckUrl("trust-check.example/path?utm_source=test");

    assert.equal(result.mode, "created");
    assert.equal(result.entity.id, createdEntity.id);
    assert.deepEqual(createInput, {
      canonicalUrl: "https://trust-check.example/path",
      createdBy: null,
      slug: "trust-check-example-path",
      title: "trust-check.example",
      type: EntityType.website
    });
    assert.equal(events.length, 1);
  });

  it("rejects invalid URLs", async () => {
    const repository = {
      create: async () => {
        throw new Error("create should not be called");
      },
      findByCanonicalUrl: async () => null
    } as unknown as EntitiesRepository;
    const service = createService(repository);

    await assert.rejects(() => service.trustCheckUrl("not a url"), {
      message: "URL must be a valid HTTP or HTTPS URL"
    });
  });

  it("does not create a page for hidden entities", async () => {
    const hidden = createEntity({
      visibility: EntityVisibility.HIDDEN
    });
    const repository = {
      create: async () => {
        throw new Error("create should not be called");
      },
      findByCanonicalUrl: async () => hidden
    } as unknown as EntitiesRepository;
    const service = createService(repository);

    await assert.rejects(() => service.trustCheckUrl("https://trust-check.example/"), {
      message: "This site is not available on Opinia"
    });
  });
});
