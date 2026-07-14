import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { buildCompareSlug, normalizeContentLocaleFilter } from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { EntityChatService } from "../../chat/services/entity-chat.service.js";
import { PresenceService } from "../../chat/services/presence.service.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { EntityDto } from "../../entities/dto/entity.dto.js";
import { BattleVoteRepository } from "../../growth/repositories/battle-vote.repository.js";
import type {
  BattlePairListDto,
  BattlePairListItemDto,
  DiscoveryEntityRankItemDto,
  DiscoveryEntityRankListDto,
  DiscussionFeedDto,
  DiscussionFeedItemDto,
  DiscoveryStatsDto,
  RandomBattleDto
} from "../dto/discovery.dto.js";
import {
  getCuratedBattlePairDefinitions,
  type CuratedBattlePairDefinition
} from "../data/curated-battle-pairs.registry.js";
import { DiscoveryRepository } from "../repositories/discovery.repository.js";

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    private readonly discoveryRepository: DiscoveryRepository,
    private readonly battleVoteRepository: BattleVoteRepository,
    private readonly entityChatService: EntityChatService,
    private readonly presenceService: PresenceService,
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort
  ) {}

  async getStats(): Promise<DiscoveryStatsDto> {
    const [activeBattles, onlineNow] = await Promise.all([
      this.discoveryRepository.countActiveBattlePairs(),
      this.presenceService.getSiteVisitorCount()
    ]);

    return {
      activeBattles,
      onlineNow
    };
  }

  async registerSiteVisitor(visitorId: string): Promise<DiscoveryStatsDto> {
    const [activeBattles, onlineNow] = await Promise.all([
      this.discoveryRepository.countActiveBattlePairs(),
      this.presenceService.markSiteVisitor(visitorId)
    ]);

    return {
      activeBattles,
      onlineNow
    };
  }

  async getActiveBattles(limit = 12, localeInput?: string): Promise<BattlePairListDto> {
    const locale = normalizeContentLocaleFilter(localeInput);
    const rows = await this.discoveryRepository.listActiveBattlePairs(limit, locale);
    const items: BattlePairListItemDto[] = [];

    for (const row of rows) {
      const item = await this.composeBattlePairItem(row.pairKey, Number(row.totalVotes), false, locale);

      if (item) {
        items.push(item);
      }
    }

    return { items };
  }

  async getSuggestedBattles(limit = 12, localeInput?: string): Promise<BattlePairListDto> {
    const locale = normalizeContentLocaleFilter(localeInput);
    const items: BattlePairListItemDto[] = [];
    const seenPairSlugs = new Set<string>();

    await this.appendCuratedBattlePairs(items, limit, seenPairSlugs, locale);

    if (items.length < limit) {
      const poolSize = Math.max((limit - items.length) * 2, 12);
      const [rootEntities, childEntities] = await Promise.all([
        this.discoveryRepository.listTopRootEntitiesByVotes(poolSize),
        this.discoveryRepository.listTopChildEntitiesByVotes(poolSize)
      ]);

      await this.appendEntityPairs(items, rootEntities, limit, seenPairSlugs, locale);

      if (items.length < limit) {
        await this.appendEntityPairs(items, childEntities, limit, seenPairSlugs, locale);
      }
    }

    return { items: items.slice(0, limit) };
  }

  async getTopRatings(sort: DiscoveryRatingsSort = "votes", limit = 20): Promise<DiscoveryEntityRankListDto> {
    if (sort === "week") {
      const rows = await this.discoveryRepository.listTopEntitiesByRecentVotes(limit, 7);

      return {
        items: rows.map((row) => mapRankRow(row, Number(row.recentVotes), null))
      };
    }

    if (sort === "reliability") {
      const rows = await this.discoveryRepository.listTopEntitiesByReliability(limit);

      return {
        items: rows.map((row) => mapRankRow(row, 0, row.reliability ?? null))
      };
    }

    const rows = await this.discoveryRepository.listTopEntitiesByVotes(limit);

    return {
      items: rows.map((row) => mapRankRow(row, 0, null))
    };
  }

  async getRisingRatings(window: "day" = "day", limit = 20): Promise<DiscoveryEntityRankListDto> {
    const windowDays = window === "day" ? 1 : 1;
    const rows = await this.discoveryRepository.listTopEntitiesByRecentVotes(limit, windowDays);

    return {
      items: rows.map((row) => ({
        avgScore: row.avgScore,
        canonicalUrl: row.canonicalUrl,
        entityId: row.entityId,
        logoUrl: row.logoUrl,
        recentVotes: Number(row.recentVotes),
        reliability: null,
        slug: row.slug,
        title: row.title,
        votesCount: row.votesCount
      }))
    };
  }

  async getDiscussionFeed(limit = 6, localeInput?: string): Promise<DiscussionFeedDto> {
    const safeLimit = Math.max(1, Math.min(limit, 20));
    const activeNow = await this.entityChatService.getActiveNow(safeLimit, localeInput);

    if (activeNow.items.length > 0) {
      const entities = await Promise.all(
        activeNow.items.map((item) => this.entitiesPort.findEntityById(item.entityId))
      );

      return {
        items: activeNow.items.map((item, index) => mapActiveNowToFeedItem(item, entities[index])),
        mode: "live"
      };
    }

    const recent = await this.entityChatService.getRecentDiscussions(safeLimit, localeInput);

    if (recent.items.length > 0) {
      const entities = await Promise.all(
        recent.items.map((item) => this.entitiesPort.findEntityById(item.entityId))
      );

      return {
        items: recent.items.map((item, index) => mapActiveNowToFeedItem(item, entities[index])),
        mode: "recent"
      };
    }

    const popular = await this.discoveryRepository.listTopEntitiesByVotes(safeLimit);

    return {
      items: popular.map((row) => ({
        avgScore: row.avgScore,
        entityCanonicalUrl: row.canonicalUrl,
        entityId: row.entityId,
        entityLogoUrl: row.logoUrl,
        entitySlug: row.slug,
        entityTitle: row.title,
        messageCount: 0,
        onlineCount: 0,
        previewMessage: null,
        votesCount: row.votesCount
      })),
      mode: "popular"
    };
  }

  async getRandomBattle(localeInput?: string): Promise<RandomBattleDto> {
    const locale = normalizeContentLocaleFilter(localeInput);
    const curatedItem = await this.pickRandomCuratedBattle(locale);

    if (curatedItem) {
      return { item: curatedItem };
    }

    const [rootEntities, childEntities] = await Promise.all([
      this.discoveryRepository.listTopRootEntitiesByVotes(20),
      this.discoveryRepository.listTopChildEntitiesByVotes(20)
    ]);
    const entityPools = [rootEntities, childEntities].filter((entities) => entities.length >= 2);

    for (const requireUnbattled of [true, false]) {
      for (const entities of entityPools) {
        const item = await this.pickRandomBattleFromEntities(entities, requireUnbattled, locale);

        if (item) {
          return { item };
        }
      }
    }

    return { item: null };
  }

  private async appendCuratedBattlePairs(
    items: BattlePairListItemDto[],
    limit: number,
    seenPairSlugs: Set<string>,
    locale: ReturnType<typeof normalizeContentLocaleFilter>
  ): Promise<void> {
    for (const battle of getCuratedBattlePairDefinitions()) {
      if (items.length >= limit) {
        return;
      }

      const item = await this.composeCuratedBattlePair(battle, seenPairSlugs, locale);

      if (item) {
        items.push(item);
      }
    }
  }

  private async composeCuratedBattlePair(
    battle: CuratedBattlePairDefinition,
    seenPairSlugs: Set<string>,
    locale: ReturnType<typeof normalizeContentLocaleFilter>
  ): Promise<BattlePairListItemDto | null> {
    const [leftEntity, rightEntity] = await Promise.all([
      this.entitiesPort.findEntityBySlug(battle.leftSlug),
      this.entitiesPort.findEntityBySlug(battle.rightSlug)
    ]);

    if (!leftEntity || !rightEntity) {
      this.logger.warn(
        `Skipping curated battle ${battle.leftKey} vs ${battle.rightKey}: one or both entities are missing from the database.`
      );

      return null;
    }

    if (leftEntity.visibility !== "ACTIVE" || rightEntity.visibility !== "ACTIVE") {
      return null;
    }

    return this.composeBattlePairFromEntityDtos(leftEntity, rightEntity, true, seenPairSlugs, locale);
  }

  private async pickRandomCuratedBattle(
    locale: ReturnType<typeof normalizeContentLocaleFilter>
  ): Promise<BattlePairListItemDto | null> {
    const curatedBattles = getCuratedBattlePairDefinitions();

    if (curatedBattles.length === 0) {
      return null;
    }

    const seenPairSlugs = new Set<string>();
    const composedItems: BattlePairListItemDto[] = [];

    for (const battle of curatedBattles) {
      const item = await this.composeCuratedBattlePair(battle, seenPairSlugs, locale);

      if (item) {
        composedItems.push(item);
      }
    }

    if (composedItems.length === 0) {
      return null;
    }

    const unbattledItems = composedItems.filter((item) => item.totalVotes === 0);
    const candidatePool = unbattledItems.length > 0 ? unbattledItems : composedItems;

    shuffleInPlace(candidatePool);

    return candidatePool[0] ?? null;
  }

  private async pickRandomBattleFromEntities(
    entities: Array<{ entityId: string; slug: string; title: string }>,
    requireUnbattled: boolean,
    locale: ReturnType<typeof normalizeContentLocaleFilter>
  ): Promise<BattlePairListItemDto | null> {
    const candidatePairs = buildEntityPairCandidates(entities);
    shuffleInPlace(candidatePairs);

    for (const [left, right] of candidatePairs) {
      const item = await this.composeBattlePairFromEntities(left, right, true, new Set<string>(), locale);

      if (!item) {
        continue;
      }

      if (!requireUnbattled || item.totalVotes === 0) {
        return item;
      }
    }

    return null;
  }

  private async appendEntityPairs(
    items: BattlePairListItemDto[],
    entities: Array<{ entityId: string; slug: string; title: string }>,
    limit: number,
    seenPairSlugs: Set<string>,
    locale: ReturnType<typeof normalizeContentLocaleFilter>
  ): Promise<void> {
    for (let index = 0; index + 1 < entities.length && items.length < limit; index += 2) {
      const left = entities[index];
      const right = entities[index + 1];

      if (!left || !right) {
        continue;
      }

      const item = await this.composeBattlePairFromEntities(left, right, true, seenPairSlugs, locale);

      if (item) {
        items.push(item);
      }
    }
  }

  private async composeBattlePairItem(
    pairKey: string,
    totalVotes: number,
    isSuggested: boolean,
    locale: ReturnType<typeof normalizeContentLocaleFilter>
  ): Promise<BattlePairListItemDto | null> {
    const entityIds = parsePairKey(pairKey);

    if (!entityIds) {
      return null;
    }

    const [leftEntity, rightEntity] = await Promise.all([
      this.entitiesPort.findEntityById(entityIds[0]),
      this.entitiesPort.findEntityById(entityIds[1])
    ]);

    if (!leftEntity || !rightEntity || leftEntity.visibility !== "ACTIVE" || rightEntity.visibility !== "ACTIVE") {
      return null;
    }

    const voteCounts = await this.battleVoteRepository.countVotesByEntity(pairKey, locale);
    const leftVotes = voteCounts.get(leftEntity.id) ?? 0;
    const rightVotes = voteCounts.get(rightEntity.id) ?? 0;
    const resolvedTotal = leftVotes + rightVotes || totalVotes;

    return buildBattlePairListItem(leftEntity, rightEntity, resolvedTotal, leftVotes, rightVotes, isSuggested);
  }

  private async composeBattlePairFromEntities(
    left: { entityId: string; slug: string; title: string },
    right: { entityId: string; slug: string; title: string },
    isSuggested: boolean,
    seenPairSlugs: Set<string>,
    locale: ReturnType<typeof normalizeContentLocaleFilter>
  ): Promise<BattlePairListItemDto | null> {
    const [leftEntity, rightEntity] = await Promise.all([
      this.entitiesPort.findEntityById(left.entityId),
      this.entitiesPort.findEntityById(right.entityId)
    ]);

    if (!leftEntity || !rightEntity || leftEntity.visibility !== "ACTIVE" || rightEntity.visibility !== "ACTIVE") {
      return null;
    }

    return this.composeBattlePairFromEntityDtos(leftEntity, rightEntity, isSuggested, seenPairSlugs, locale);
  }

  private async composeBattlePairFromEntityDtos(
    leftEntity: EntityDto,
    rightEntity: EntityDto,
    isSuggested: boolean,
    seenPairSlugs: Set<string>,
    locale: ReturnType<typeof normalizeContentLocaleFilter>
  ): Promise<BattlePairListItemDto | null> {
    const pairSlug = buildCompareSlug(leftEntity.slug, rightEntity.slug);

    if (seenPairSlugs.has(pairSlug)) {
      return null;
    }

    seenPairSlugs.add(pairSlug);

    const pairKey = [leftEntity.id, rightEntity.id].sort().join(":");
    const voteCounts = await this.battleVoteRepository.countVotesByEntity(pairKey, locale);
    const leftVotes = voteCounts.get(leftEntity.id) ?? 0;
    const rightVotes = voteCounts.get(rightEntity.id) ?? 0;
    const totalVotes = leftVotes + rightVotes;

    return buildBattlePairListItem(leftEntity, rightEntity, totalVotes, leftVotes, rightVotes, isSuggested);
  }
}

function parsePairKey(pairKey: string): [string, string] | null {
  const parts = pairKey.split(":");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return [parts[0], parts[1]];
}

function buildBattlePairListItem(
  leftEntity: EntityDto,
  rightEntity: EntityDto,
  totalVotes: number,
  leftVotes: number,
  rightVotes: number,
  isSuggested: boolean
): BattlePairListItemDto {
  const leftPercent = totalVotes > 0 ? Math.round((leftVotes / totalVotes) * 100) : 0;
  const rightPercent = totalVotes > 0 ? Math.round((rightVotes / totalVotes) * 100) : 0;

  return {
    isSuggested,
    leftCanonicalUrl: leftEntity.canonicalUrl,
    leftEntityId: leftEntity.id,
    leftLabel: leftEntity.title,
    leftLogoUrl: leftEntity.logoUrl,
    leftPercent,
    leftSlug: leftEntity.slug,
    pairSlug: buildCompareSlug(leftEntity.slug, rightEntity.slug),
    rightCanonicalUrl: rightEntity.canonicalUrl,
    rightEntityId: rightEntity.id,
    rightLabel: rightEntity.title,
    rightLogoUrl: rightEntity.logoUrl,
    rightPercent,
    rightSlug: rightEntity.slug,
    totalVotes
  };
}

export function assertDiscoveryLimit(limit: number | undefined, fallback: number): number {
  if (!limit) {
    return fallback;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw createAppException({
      code: AppErrorCode.ValidationError,
      message: "limit must be between 1 and 20",
      statusCode: HttpStatus.BAD_REQUEST
    });
  }

  return limit;
}

export type DiscoveryRatingsSort = "week" | "votes" | "reliability";

export function normalizeTopRatingsSort(
  value: "week" | "votes" | "reliability" | "all" | undefined
): DiscoveryRatingsSort {
  if (value === "week") {
    return "week";
  }

  if (value === "reliability") {
    return "reliability";
  }

  return "votes";
}

function mapRankRow(
  row: {
    avgScore: number;
    canonicalUrl: string | null;
    entityId: string;
    logoUrl: string | null;
    slug: string;
    title: string;
    votesCount: number;
  },
  recentVotes: number,
  reliability: number | null
): DiscoveryEntityRankItemDto {
  return {
    avgScore: row.avgScore,
    canonicalUrl: row.canonicalUrl,
    entityId: row.entityId,
    logoUrl: row.logoUrl,
    recentVotes,
    reliability,
    slug: row.slug,
    title: row.title,
    votesCount: row.votesCount
  };
}

function mapActiveNowToFeedItem(item: {
  entityId: string;
  entitySlug: string;
  entityTitle: string;
  messageCount: number;
  onlineCount: number;
  previewMessage: string | null;
}, entity: EntityDto | null | undefined): DiscussionFeedItemDto {
  return {
    avgScore: null,
    entityCanonicalUrl: entity?.canonicalUrl ?? null,
    entityId: item.entityId,
    entityLogoUrl: entity?.logoUrl ?? null,
    entitySlug: item.entitySlug,
    entityTitle: item.entityTitle,
    messageCount: item.messageCount,
    onlineCount: item.onlineCount,
    previewMessage: item.previewMessage,
    votesCount: null
  };
}

type EntityPairCandidate = [
  { entityId: string; slug: string; title: string },
  { entityId: string; slug: string; title: string }
];

function buildEntityPairCandidates(
  entities: Array<{ entityId: string; slug: string; title: string }>
): EntityPairCandidate[] {
  const pairs: EntityPairCandidate[] = [];

  for (let leftIndex = 0; leftIndex < entities.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entities.length; rightIndex += 1) {
      const left = entities[leftIndex];
      const right = entities[rightIndex];

      if (left && right && left.entityId !== right.entityId) {
        pairs.push([left, right]);
      }
    }
  }

  return pairs;
}

function shuffleInPlace<T>(items: T[]): void {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = items[index];

    if (current !== undefined) {
      items[index] = items[swapIndex] as T;
      items[swapIndex] = current;
    }
  }
}
