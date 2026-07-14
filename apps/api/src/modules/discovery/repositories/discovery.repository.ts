import { Injectable } from "@nestjs/common";
import type { ContentLocaleParam } from "@reviewo/shared";
import { Prisma } from "#prisma/client";

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
  canonicalUrl: string | null;
  entityId: string;
  logoUrl: string | null;
  reliability?: number;
  slug: string;
  title: string;
  votesCount: number;
}

export interface RisingEntityRow {
  avgScore: number;
  canonicalUrl: string | null;
  entityId: string;
  logoUrl: string | null;
  recentVotes: bigint;
  slug: string;
  title: string;
  votesCount: number;
}

@Injectable()
export class DiscoveryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listActiveBattlePairs(limit: number, locale?: ContentLocaleParam): Promise<ActiveBattlePairRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));

    return this.prismaService.$queryRaw<ActiveBattlePairRow[]>`
      SELECT
        pair_key AS "pairKey",
        COUNT(*)::bigint AS "totalVotes",
        MAX(created_at) AS "lastVoteAt"
      FROM growth.battle_votes
      ${locale && locale !== "all" ? Prisma.sql`WHERE locale = ${locale}` : Prisma.empty}
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
        e.canonical_url AS "canonicalUrl",
        e.logo_url AS "logoUrl",
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
      GROUP BY e.id, e.canonical_url, e.logo_url, e.slug, e.title, ra.votes_count, ra.avg_score
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
        e.canonical_url AS "canonicalUrl",
        e.logo_url AS "logoUrl",
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
        e.canonical_url AS "canonicalUrl",
        e.logo_url AS "logoUrl",
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

  async listTopEntitiesByReliability(limit: number): Promise<TopEntityRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 20));

    return this.prismaService.$queryRaw<TopEntityRow[]>`
      SELECT
        e.id AS "entityId",
        e.canonical_url AS "canonicalUrl",
        e.logo_url AS "logoUrl",
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
        ) AS "reliability"
      FROM ratings.rating_aggregates ra
      INNER JOIN entities.entities e ON e.id = ra.entity_id
      LEFT JOIN reputation.entity_confidence_profiles ecp ON ecp.entity_id = e.id
      LEFT JOIN (
        SELECT entity_id, COUNT(*)::int AS review_count
        FROM reviews.reviews
        GROUP BY entity_id
      ) rc ON rc.entity_id = e.id
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND ra.votes_count >= ${MIN_TOP_VOTES}
      ORDER BY "reliability" DESC, ra.votes_count DESC, ra.avg_score DESC
      LIMIT ${safeLimit}
    `;
  }

  async listTopRootEntitiesByVotes(limit: number): Promise<TopEntityRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 30));

    return this.prismaService.$queryRaw<TopEntityRow[]>`
      SELECT
        e.id AS "entityId",
        e.canonical_url AS "canonicalUrl",
        e.logo_url AS "logoUrl",
        e.slug AS "slug",
        e.title AS "title",
        ra.votes_count::int AS "votesCount",
        ra.avg_score::float8 AS "avgScore"
      FROM ratings.rating_aggregates ra
      INNER JOIN entities.entities e ON e.id = ra.entity_id
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND e.parent_id IS NULL
        AND (
          e.canonical_url IS NULL
          OR length(regexp_replace(e.canonical_url, '^https?://[^/]+', '')) <= 1
        )
        AND ra.votes_count >= ${MIN_TOP_VOTES}
      ORDER BY ra.votes_count DESC, ra.avg_score DESC
      LIMIT ${safeLimit}
    `;
  }

  async listTopChildEntitiesByVotes(limit: number): Promise<TopEntityRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 30));

    return this.prismaService.$queryRaw<TopEntityRow[]>`
      SELECT
        e.id AS "entityId",
        e.canonical_url AS "canonicalUrl",
        e.logo_url AS "logoUrl",
        e.slug AS "slug",
        e.title AS "title",
        ra.votes_count::int AS "votesCount",
        ra.avg_score::float8 AS "avgScore"
      FROM ratings.rating_aggregates ra
      INNER JOIN entities.entities e ON e.id = ra.entity_id
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND (
          e.parent_id IS NOT NULL
          OR (
            e.canonical_url IS NOT NULL
            AND length(regexp_replace(e.canonical_url, '^https?://[^/]+', '')) > 1
          )
        )
        AND ra.votes_count >= ${MIN_TOP_VOTES}
      ORDER BY ra.votes_count DESC, ra.avg_score DESC
      LIMIT ${safeLimit}
    `;
  }

  async countActiveBattlePairs(): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT pair_key
        FROM growth.battle_votes
        GROUP BY pair_key
        HAVING COUNT(*) >= 1
      ) active_pairs
    `;

    return Number(rows[0]?.count ?? 0);
  }
}
