import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EntityMediaSource } from "#prisma/client";

import { EntityMediaService } from "./entity-media.service.js";
import type { EntitiesRepository } from "../repositories/entities.repository.js";
import type { EntityMediaRepository } from "../repositories/entity-media.repository.js";

describe("EntityMediaService", () => {
  it("syncs logoUrl cache from the highest-trust media row", async () => {
    const entityMediaRepository = {
      findPrimaryLogo: async () => ({
        entityId: "entity-1",
        id: "media-1",
        source: EntityMediaSource.FAVICON,
        trustScore: "0.700",
        type: "LOGO",
        url: "https://example.com/favicon.ico"
      })
    } as unknown as EntityMediaRepository;

    let syncedLogoUrl: string | null | undefined;

    const entitiesRepository = {
      updateLogoUrl: async (_entityId: string, logoUrl: string | null) => {
        syncedLogoUrl = logoUrl;
      }
    } as unknown as EntitiesRepository;

    const service = new EntityMediaService(entityMediaRepository, entitiesRepository);
    const logoUrl = await service.syncLogoUrlCache("entity-1");

    assert.equal(logoUrl, "https://example.com/favicon.ico");
    assert.equal(syncedLogoUrl, "https://example.com/favicon.ico");
  });

  it("clears manual logos and syncs null cache", async () => {
    const deletedSources: EntityMediaSource[][] = [];

    const entityMediaRepository = {
      deleteLogoBySources: async (_entityId: string, sources: EntityMediaSource[]) => {
        deletedSources.push(sources);
      },
      findPrimaryLogo: async () => null
    } as unknown as EntityMediaRepository;

    let syncedLogoUrl: string | null | undefined = "pending";

    const entitiesRepository = {
      updateLogoUrl: async (_entityId: string, logoUrl: string | null) => {
        syncedLogoUrl = logoUrl;
      }
    } as unknown as EntitiesRepository;

    const service = new EntityMediaService(entityMediaRepository, entitiesRepository);

    await service.setManualLogo("entity-1", null, EntityMediaSource.CONTRIBUTION);

    assert.deepEqual(deletedSources, [[EntityMediaSource.CONTRIBUTION]]);
    assert.equal(syncedLogoUrl, null);
  });
});
