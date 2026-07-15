import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityType, EntityVisibility } from "#prisma/client";

import type { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import type { EntitiesRepository } from "../repositories/entities.repository.js";
import { EntitiesService } from "./entities.service.js";
import type { UrlNormalizer } from "../interfaces/url-normalizer.js";

const currentUser: AuthenticatedUser = {
  avatarUrl: null,
  displayName: "Tester",
  email: "tester@example.com",
  id: "11111111-1111-4111-8111-111111111111",
  role: "USER",
  status: "active",
  username: null
};

function createService(repository: EntitiesRepository) {
  const urlNormalizer: UrlNormalizer = {
    normalize: (input) => input,
    getSiteRootCanonicalUrl: (canonicalUrl) => new URL(canonicalUrl).origin + "/"
  };
  const eventBus = { publish: async () => undefined } as unknown as DomainEventBus;

  return new EntitiesService(repository, eventBus, urlNormalizer);
}

describe("EntitiesService visibility", () => {
  it("resolves hidden entity as hidden without exposing entity payload", async () => {
    const repository = {
      findByCanonicalUrl: async () => ({
        canonicalUrl: "https://hidden.example/",
        createdAt: new Date("2026-06-27T00:00:00.000Z"),
        createdBy: currentUser.id,
        description: null,
        logoUrl: null,
        id: "22222222-2222-4222-8222-222222222222",
        parentId: null,
        slug: "hidden-example",
        title: "hidden.example",
        type: EntityType.website,
        updatedAt: new Date("2026-06-27T00:00:00.000Z"),
        visibility: EntityVisibility.HIDDEN
      })
    } as unknown as EntitiesRepository;
    const service = createService(repository);

    const result = await service.resolveEntityByUrl("https://hidden.example/");

    assert.equal(result.resolution, "hidden");
    assert.equal(result.entity, null);
  });

  it("treats hidden entity as unavailable for public lookup by id", async () => {
    const repository = {
      findById: async () => ({
        canonicalUrl: "https://hidden.example/",
        createdAt: new Date("2026-06-27T00:00:00.000Z"),
        createdBy: currentUser.id,
        description: null,
        logoUrl: null,
        id: "22222222-2222-4222-8222-222222222222",
        parentId: null,
        slug: "hidden-example",
        title: "hidden.example",
        type: EntityType.website,
        updatedAt: new Date("2026-06-27T00:00:00.000Z"),
        visibility: EntityVisibility.HIDDEN
      })
    } as unknown as EntitiesRepository;
    const service = createService(repository);

    const entity = await service.findEntityById("22222222-2222-4222-8222-222222222222");

    assert.equal(entity, null);
  });

  it("blocks lazy creation when canonical URL is hidden", async () => {
    const repository = {
      create: async () => {
        throw new Error("create should not be called");
      },
      findByCanonicalUrl: async () => ({
        canonicalUrl: "https://hidden.example/",
        createdAt: new Date("2026-06-27T00:00:00.000Z"),
        createdBy: currentUser.id,
        description: null,
        logoUrl: null,
        id: "22222222-2222-4222-8222-222222222222",
        parentId: null,
        slug: "hidden-example",
        title: "hidden.example",
        type: EntityType.website,
        updatedAt: new Date("2026-06-27T00:00:00.000Z"),
        visibility: EntityVisibility.HIDDEN
      })
    } as unknown as EntitiesRepository;
    const service = createService(repository);

    await assert.rejects(
      () => service.ensureEntityForUrl("https://hidden.example/", {}, currentUser),
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        (error as { message?: string }).message === "This site is not available on Opinia"
    );
  });
});

