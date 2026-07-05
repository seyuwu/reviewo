import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { buildCompareSlug } from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import type { EntityDto } from "../../entities/dto/entity.dto.js";
import { BattleVoteRepository } from "../../growth/repositories/battle-vote.repository.js";
import type {
  BattlePairListDto,
  BattlePairListItemDto,
  DiscoveryEntityRankListDto
} from "../dto/discovery.dto.js";
import { DiscoveryRepository } from "../repositories/discovery.repository.js";

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly discoveryRepository: DiscoveryRepository,
    private readonly battleVoteRepository: BattleVoteRepository,
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort
  ) {}

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
    const topEntities = await this.discoveryRepository.listTopEntitiesByVotes(Math.max(limit * 2, 8));
    const items: BattlePairListItemDto[] = [];
    const seenPairSlugs = new Set<string>();

    for (let index = 0; index + 1 < topEntities.length && items.length < limit; index += 2) {
      const left = topEntities[index];
      const right = topEntities[index + 1];

      if (!left || !right) {
        continue;
      }

      const item = await this.composeBattlePairFromEntities(left, right, true, seenPairSlugs);

      if (item) {
        items.push(item);
      }
    }

    if (topEntities.length >= 2 && items.length < limit) {
      const first = topEntities[0];
      const last = topEntities[topEntities.length - 1];

      if (first && last && first.entityId !== last.entityId) {
        const item = await this.composeBattlePairFromEntities(first, last, true, seenPairSlugs);

        if (item) {
          items.push(item);
        }
      }
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
