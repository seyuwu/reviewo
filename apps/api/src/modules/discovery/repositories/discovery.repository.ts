import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";

const MIN_TOP_VOTES = 1;
const MIN_ALL_TIME_TOP_VOTES = 3;

export interface ActiveBattlePairRow {
  lastVoteAt: Date;
  pairKey: string;
  totalVotes: bigint;
}

export interface TopEntityRow {
  avgScore: number;
  entityId: string;
  slug: string;
  title: string;
  votesCount: number;
}

export interface RisingEntityRow {
  avgScore: number;
  entityId: string;
  recentVotes: bigint;
  slug: string;
  title: string;
  votesCount: number;
}

@Injectable()
export class DiscoveryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listActiveBattlePairs(limit: number): Promise<ActiveBattlePairRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));

    return this.prismaService.$queryRaw<ActiveBattlePairRow[]>`
      SELECT
        pair_key AS "pairKey",
        COUNT(*)::bigint AS "totalVotes",
        MAX(created_at) AS "lastVoteAt"
      FROM growth.battle_votes
      GROUP BY pair_key
      HAVING COUNT(*) >= 1
      ORDER BY COUNT(*) DESC, MAX(created_at) DESC
      LIMIT ${safeLimit}
    `;
  }

  async listTopEntitiesByRecentVotes(limit: number, windowDays: number): Promise<RisingEntityRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));
    const windowStart = new Date(Date.now() - windowDays * 86_400_000);

    return this.prismaService.$queryRaw<RisingEntityRow[]>`
      SELECT
        e.id AS "entityId",
        e.slug AS "slug",
        e.title AS "title",
        COALESCE(ra.votes_count, 0)::int AS "votesCount",
        COALESCE(ra.avg_score, 0)::float8 AS "avgScore",
        COUNT(r.id)::bigint AS "recentVotes"
      FROM ratings.ratings r
      INNER JOIN entities.entities e ON e.id = r.entity_id
      LEFT JOIN ratings.rating_aggregates ra ON ra.entity_id = e.id
      WHERE r.created_at >= ${windowStart}
        AND e.visibility = 'ACTIVE'::entities.entity_visibility
      GROUP BY e.id, e.slug, e.title, ra.votes_count, ra.avg_score
      HAVING COUNT(r.id) >= 1
      ORDER BY COUNT(r.id) DESC, COALESCE(ra.avg_score, 0) DESC
      LIMIT ${safeLimit}
    `;
  }

  async listTopEntitiesAllTime(limit: number): Promise<TopEntityRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));

    return this.prismaService.$queryRaw<TopEntityRow[]>`
      SELECT
        e.id AS "entityId",
        e.slug AS "slug",
        e.title AS "title",
        ra.votes_count::int AS "votesCount",
        ra.avg_score::float8 AS "avgScore"
      FROM ratings.rating_aggregates ra
      INNER JOIN entities.entities e ON e.id = ra.entity_id
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND ra.votes_count >= ${MIN_ALL_TIME_TOP_VOTES}
      ORDER BY ra.avg_score DESC, ra.votes_count DESC
      LIMIT ${safeLimit}
    `;
  }

  async listTopEntitiesByVotes(limit: number): Promise<TopEntityRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));

    return this.prismaService.$queryRaw<TopEntityRow[]>`
      SELECT
        e.id AS "entityId",
        e.slug AS "slug",
        e.title AS "title",
        ra.votes_count::int AS "votesCount",
        ra.avg_score::float8 AS "avgScore"
      FROM ratings.rating_aggregates ra
      INNER JOIN entities.entities e ON e.id = ra.entity_id
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND ra.votes_count >= ${MIN_TOP_VOTES}
      ORDER BY ra.votes_count DESC, ra.avg_score DESC
      LIMIT ${safeLimit}
    `;
  }
}
