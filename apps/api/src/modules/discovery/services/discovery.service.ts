import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { buildCompareSlug } from "@reviewo/shared";

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
  DiscoveryEntityRankListDto,
  DiscussionFeedDto,
  DiscussionFeedItemDto,
  DiscoveryStatsDto,
  RandomBattleDto
} from "../dto/discovery.dto.js";
import { DiscoveryRepository } from "../repositories/discovery.repository.js";

@Injectable()
export class DiscoveryService {
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

  async getActiveBattles(limit = 12): Promise<BattlePairListDto> {
    const rows = await this.discoveryRepository.listActiveBattlePairs(limit);
    const items: BattlePairListItemDto[] = [];

    for (const row of rows) {
      const item = await this.composeBattlePairItem(row.pairKey, Number(row.totalVotes), false);

      if (item) {
        items.push(item);
      }
    }

    return { items };
  }

  async getSuggestedBattles(limit = 12): Promise<BattlePairListDto> {
    const poolSize = Math.max(limit * 2, 12);
    const [rootEntities, childEntities] = await Promise.all([
      this.discoveryRepository.listTopRootEntitiesByVotes(poolSize),
      this.discoveryRepository.listTopChildEntitiesByVotes(poolSize)
    ]);
    const items: BattlePairListItemDto[] = [];
    const seenPairSlugs = new Set<string>();

    await this.appendEntityPairs(items, rootEntities, limit, seenPairSlugs);

    if (items.length < limit) {
      await this.appendEntityPairs(items, childEntities, limit, seenPairSlugs);
    }

    return { items: items.slice(0, limit) };
  }

  async getTopRatings(window: "week" | "all" = "all", limit = 20): Promise<DiscoveryEntityRankListDto> {
    if (window === "week") {
      const rows = await this.discoveryRepository.listTopEntitiesByRecentVotes(limit, 7);

      return {
        items: rows.map((row) => ({
          avgScore: row.avgScore,
          entityId: row.entityId,
          recentVotes: Number(row.recentVotes),
          slug: row.slug,
          title: row.title,
          votesCount: row.votesCount
        }))
      };
    }

    const rows = await this.discoveryRepository.listTopEntitiesAllTime(limit);

    return {
      items: rows.map((row) => ({
        avgScore: row.avgScore,
        entityId: row.entityId,
        recentVotes: 0,
        slug: row.slug,
        title: row.title,
        votesCount: row.votesCount
      }))
    };
  }

  async getRisingRatings(window: "day" = "day", limit = 20): Promise<DiscoveryEntityRankListDto> {
    const windowDays = window === "day" ? 1 : 1;
    const rows = await this.discoveryRepository.listTopEntitiesByRecentVotes(limit, windowDays);

    return {
      items: rows.map((row) => ({
        avgScore: row.avgScore,
        entityId: row.entityId,
        recentVotes: Number(row.recentVotes),
        slug: row.slug,
        title: row.title,
        votesCount: row.votesCount
      }))
    };
  }

  async getDiscussionFeed(limit = 6): Promise<DiscussionFeedDto> {
    const safeLimit = Math.max(1, Math.min(limit, 20));
    const activeNow = await this.entityChatService.getActiveNow(safeLimit);

    if (activeNow.items.length > 0) {
      return {
        items: activeNow.items.map((item) => mapActiveNowToFeedItem(item)),
        mode: "live"
      };
    }

    const recent = await this.entityChatService.getRecentDiscussions(safeLimit);

    if (recent.items.length > 0) {
      return {
        items: recent.items.map((item) => mapActiveNowToFeedItem(item)),
        mode: "recent"
      };
    }

    const popular = await this.discoveryRepository.listTopEntitiesByVotes(safeLimit);

    return {
      items: popular.map((row) => ({
        avgScore: row.avgScore,
        entityId: row.entityId,
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

  async getRandomBattle(): Promise<RandomBattleDto> {
    const [rootEntities, childEntities] = await Promise.all([
      this.discoveryRepository.listTopRootEntitiesByVotes(20),
      this.discoveryRepository.listTopChildEntitiesByVotes(20)
    ]);
    const entityPools = [rootEntities, childEntities].filter((entities) => entities.length >= 2);

    for (const requireUnbattled of [true, false]) {
      for (const entities of entityPools) {
        const item = await this.pickRandomBattleFromEntities(entities, requireUnbattled);

        if (item) {
          return { item };
        }
      }
    }

    return { item: null };
  }

  private async pickRandomBattleFromEntities(
    entities: Array<{ entityId: string; slug: string; title: string }>,
    requireUnbattled: boolean
  ): Promise<BattlePairListItemDto | null> {
    const candidatePairs = buildEntityPairCandidates(entities);
    shuffleInPlace(candidatePairs);

    for (const [left, right] of candidatePairs) {
      const item = await this.composeBattlePairFromEntities(left, right, true, new Set<string>());

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
    seenPairSlugs: Set<string>
  ): Promise<void> {
    for (let index = 0; index + 1 < entities.length && items.length < limit; index += 2) {
      const left = entities[index];
      const right = entities[index + 1];

      if (!left || !right) {
        continue;
      }

      const item = await this.composeBattlePairFromEntities(left, right, true, seenPairSlugs);

      if (item) {
        items.push(item);
      }
    }
  }

  private async composeBattlePairItem(
    pairKey: string,
    totalVotes: number,
    isSuggested: boolean
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

    const voteCounts = await this.battleVoteRepository.countVotesByEntity(pairKey);
    const leftVotes = voteCounts.get(leftEntity.id) ?? 0;
    const rightVotes = voteCounts.get(rightEntity.id) ?? 0;
    const resolvedTotal = leftVotes + rightVotes || totalVotes;

    return buildBattlePairListItem(leftEntity, rightEntity, resolvedTotal, leftVotes, rightVotes, isSuggested);
  }

  private async composeBattlePairFromEntities(
    left: { entityId: string; slug: string; title: string },
    right: { entityId: string; slug: string; title: string },
    isSuggested: boolean,
    seenPairSlugs: Set<string>
  ): Promise<BattlePairListItemDto | null> {
    const [leftEntity, rightEntity] = await Promise.all([
      this.entitiesPort.findEntityById(left.entityId),
      this.entitiesPort.findEntityById(right.entityId)
    ]);

    if (!leftEntity || !rightEntity || leftEntity.visibility !== "ACTIVE" || rightEntity.visibility !== "ACTIVE") {
      return null;
    }

    const pairSlug = buildCompareSlug(leftEntity.slug, rightEntity.slug);

    if (seenPairSlugs.has(pairSlug)) {
      return null;
    }

    seenPairSlugs.add(pairSlug);

    const pairKey = [leftEntity.id, rightEntity.id].sort().join(":");
    const voteCounts = await this.battleVoteRepository.countVotesByEntity(pairKey);
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
    leftEntityId: leftEntity.id,
    leftLabel: leftEntity.title,
    leftPercent,
    leftSlug: leftEntity.slug,
    pairSlug: buildCompareSlug(leftEntity.slug, rightEntity.slug),
    rightEntityId: rightEntity.id,
    rightLabel: rightEntity.title,
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

function mapActiveNowToFeedItem(item: {
  entityId: string;
  entitySlug: string;
  entityTitle: string;
  messageCount: number;
  onlineCount: number;
  previewMessage: string | null;
}): DiscussionFeedItemDto {
  return {
    avgScore: null,
    entityId: item.entityId,
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
