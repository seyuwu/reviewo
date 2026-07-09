import { Injectable } from "@nestjs/common";
import { TopSystemSortKey } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import { USER_TOP_MIN_VOTES } from "../constants/top-limits.js";
import {
  buildScoreExpression,
  mapTopSystemSortKeyToSystemTopSort,
  sortRankedEntities,
  type TopRankedEntityRow
} from "../top-rank.utils.js";

export interface UserTopRankEntry {
  status: "insufficient_data" | "ok";
  systemPosition?: number;
  systemScore?: number;
}

export type UserTopRankMap = Map<string, UserTopRankEntry>;

@Injectable()
export class UserTopRankService {
  constructor(private readonly prismaService: PrismaService) {}

  async computeRankings(
    entityIds: string[],
    sortKey: TopSystemSortKey,
    minVotes: number = USER_TOP_MIN_VOTES
  ): Promise<UserTopRankMap> {
    const uniqueEntityIds = [...new Set(entityIds)];
    const result: UserTopRankMap = new Map();

    if (uniqueEntityIds.length === 0) {
      return result;
    }

    const sort = mapTopSystemSortKeyToSystemTopSort(sortKey);
    const rows = await this.fetchEntityRankRows(uniqueEntityIds, sort);
    const rowByEntityId = new Map(rows.map((row) => [row.entityId, row]));

    for (const entityId of uniqueEntityIds) {
      const row = rowByEntityId.get(entityId);

      if (!row || row.votesCount < minVotes) {
        result.set(entityId, { status: "insufficient_data" });
      }
    }

    const eligibleRows = uniqueEntityIds.flatMap((entityId) => {
      const row = rowByEntityId.get(entityId);

      if (!row || row.votesCount < minVotes) {
        return [];
      }

      return [row];
    });

    const sorted = sortRankedEntities(eligibleRows, sort);

    sorted.forEach((row, index) => {
      result.set(row.entityId, {
        status: "ok",
        systemPosition: index + 1,
        systemScore: row.score
      });
    });

    return result;
  }

  private async fetchEntityRankRows(
    entityIds: string[],
    sort: ReturnType<typeof mapTopSystemSortKeyToSystemTopSort>
  ): Promise<TopRankedEntityRow[]> {
    return this.prismaService.$queryRaw<TopRankedEntityRow[]>`
      SELECT
        e.id AS "entityId",
        e.slug AS "slug",
        e.title AS "title",
        ra.votes_count::int AS "votesCount",
        ra.avg_score::float8 AS "avgScore",
        COALESCE(
          ecp.confidence_score::float8,
          LEAST(
            1.0::float8,
            (LEAST(ra.votes_count, 100)::float8 / 100.0) * 0.9
            + (LEAST(COALESCE(rc.review_count, 0), 20)::float8 / 20.0) * 0.1
          )
        ) AS "reliability",
        ${buildScoreExpression(sort)} AS "score"
      FROM ratings.rating_aggregates ra
      INNER JOIN entities.entities e ON e.id = ra.entity_id
      LEFT JOIN reputation.entity_confidence_profiles ecp ON ecp.entity_id = e.id
      LEFT JOIN (
        SELECT entity_id, COUNT(*)::int AS review_count
        FROM reviews.reviews
        GROUP BY entity_id
      ) rc ON rc.entity_id = e.id
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND e.id = ANY(${entityIds}::uuid[])
    `;
  }
}
