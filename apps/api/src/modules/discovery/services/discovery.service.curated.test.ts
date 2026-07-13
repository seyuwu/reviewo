import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCompareSlug } from "@reviewo/shared";

import type { EntityDto } from "../../entities/dto/entity.dto.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { BattleVoteRepository } from "../../growth/repositories/battle-vote.repository.js";
import { resetCuratedBattlePairsCacheForTests } from "../data/curated-battle-pairs.registry.js";
import { DiscoveryRepository } from "../repositories/discovery.repository.js";
import { DiscoveryService } from "./discovery.service.js";

function createEntity(partial: Pick<EntityDto, "id" | "slug" | "title" | "canonicalUrl">): EntityDto {
  return {
    canonicalUrl: partial.canonicalUrl,
    createdAt: "2026-01-01T00:00:00.000Z",
    description: null,
    id: partial.id,
    logoUrl: null,
    parentId: null,
    slug: partial.slug,
    title: partial.title,
    type: "website",
    updatedAt: "2026-01-01T00:00:00.000Z",
    visibility: "ACTIVE"
  };
}

function createEntitiesPort(entities: EntityDto[]): EntitiesPort {
  const bySlug = new Map(entities.map((entity) => [entity.slug, entity]));

  return {
    ensureEntityForUrl: async () => {
      throw new Error("not implemented");
    },
    findEntityById: async (entityId: string) => entities.find((entity) => entity.id === entityId) ?? null,
    findEntityBySlug: async (slug: string) => bySlug.get(slug.trim().toLowerCase()) ?? null,
    hideEntity: async () => {
      throw new Error("not implemented");
    },
    listChildEntities: async () => [],
    resolveEntityByUrl: async (url: string) => ({
      canonicalUrl: url,
      entity: null,
      inputUrl: url,
      resolution: "not_found"
    }),
    searchEntities: async () => [],
    searchEntitiesRanked: async () => [],
    unhideEntity: async () => {
      throw new Error("not implemented");
    }
  };
}

describe("DiscoveryService curated battles", () => {
  it("returns curated pairs first in suggested battles", async () => {
    resetCuratedBattlePairsCacheForTests();

    const entitiesPort = createEntitiesPort([
      createEntity({
        canonicalUrl: "https://claude.ai/",
        id: "entity-claude",
        slug: "claude",
        title: "Claude"
      }),
      createEntity({
        canonicalUrl: "https://chatgpt.com/",
        id: "entity-chatgpt",
        slug: "chatgpt",
        title: "ChatGPT"
      })
    ]);

    const battleVoteRepository = {
      countVotesByEntity: async () => new Map<string, number>()
    } as unknown as BattleVoteRepository;

    const service = new DiscoveryService(
      {} as DiscoveryRepository,
      battleVoteRepository,
      {} as never,
      {} as never,
      entitiesPort
    );

    const response = await service.getSuggestedBattles(1);

    assert.equal(response.items.length, 1);
    assert.equal(response.items[0]?.pairSlug, buildCompareSlug("claude", "chatgpt"));
    assert.equal(response.items[0]?.totalVotes, 0);
    assert.equal(response.items[0]?.isSuggested, true);
  });

  it("prefers curated pairs for random battle when entities exist", async () => {
    resetCuratedBattlePairsCacheForTests();

    const entitiesPort = createEntitiesPort([
      createEntity({
        canonicalUrl: "https://cursor.com/",
        id: "entity-cursor",
        slug: "cursor",
        title: "Cursor"
      }),
      createEntity({
        canonicalUrl: "https://windsurf.com/",
        id: "entity-windsurf",
        slug: "windsurf",
        title: "Windsurf"
      })
    ]);

    const battleVoteRepository = {
      countVotesByEntity: async () => new Map<string, number>()
    } as unknown as BattleVoteRepository;

    const service = new DiscoveryService(
      {} as DiscoveryRepository,
      battleVoteRepository,
      {} as never,
      {} as never,
      entitiesPort
    );

    const response = await service.getRandomBattle();

    assert.ok(response.item);
    assert.equal(response.item?.pairSlug, buildCompareSlug("cursor", "windsurf"));
    assert.equal(response.item?.totalVotes, 0);
  });
});
