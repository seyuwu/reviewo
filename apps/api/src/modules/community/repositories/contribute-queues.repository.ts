import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";

export interface ContributeQueueItemRow {
  entityId: string;
  slug: string;
  title: string;
  viewerHasRated?: boolean;
}

export interface ContributeTopQueueItemRow {
  slug: string;
  title: string;
  topId: string;
}

export interface ContributeBattleQueueItemRow {
  leftSlug: string;
  pairKey: string;
  pairSlug: string;
  rightSlug: string;
  totalVotes: number;
}

@Injectable()
export class ContributeQueuesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async countEntitiesWithoutReviews(): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM entities.entities e
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND NOT EXISTS (
          SELECT 1
          FROM reviews.reviews r
          WHERE r.entity_id = e.id
            AND r.visibility = 'ACTIVE'::reviews.review_visibility
        )
    `;

    return Number(rows[0]?.count ?? 0);
  }

  async listEntitiesWithoutReviews(
    limit: number,
    viewerUserId?: string
  ): Promise<ContributeQueueItemRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));

    if (!viewerUserId) {
      return this.prismaService.$queryRaw<ContributeQueueItemRow[]>`
        SELECT
          e.id AS "entityId",
          e.slug AS slug,
          e.title AS title
        FROM entities.entities e
        WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
          AND NOT EXISTS (
            SELECT 1
            FROM reviews.reviews r
            WHERE r.entity_id = e.id
              AND r.visibility = 'ACTIVE'::reviews.review_visibility
          )
        ORDER BY e.created_at DESC
        LIMIT ${safeLimit}
      `;
    }

    return this.prismaService.$queryRaw<ContributeQueueItemRow[]>`
      SELECT
        e.id AS "entityId",
        e.slug AS slug,
        e.title AS title,
        (viewer_rating.id IS NOT NULL) AS "viewerHasRated"
      FROM entities.entities e
      LEFT JOIN ratings.ratings viewer_rating
        ON viewer_rating.entity_id = e.id
        AND viewer_rating.user_id = ${viewerUserId}::uuid
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND NOT EXISTS (
          SELECT 1
          FROM reviews.reviews r
          WHERE r.entity_id = e.id
            AND r.visibility = 'ACTIVE'::reviews.review_visibility
        )
        AND NOT EXISTS (
          SELECT 1
          FROM reviews.reviews viewer_review
          WHERE viewer_review.entity_id = e.id
            AND viewer_review.author_id = ${viewerUserId}::uuid
            AND viewer_review.visibility = 'ACTIVE'::reviews.review_visibility
        )
      ORDER BY e.created_at DESC
      LIMIT ${safeLimit}
    `;
  }

  async countEntitiesWithoutLogo(): Promise<number> {
    return this.prismaService.entity.count({
      where: {
        logoUrl: null,
        visibility: "ACTIVE"
      }
    });
  }

  async listEntitiesWithoutLogo(limit: number): Promise<ContributeQueueItemRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));

    return this.prismaService.entity.findMany({
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        slug: true,
        title: true
      },
      take: safeLimit,
      where: {
        logoUrl: null,
        visibility: "ACTIVE"
      }
    }).then((rows) =>
      rows.map((row) => ({
        entityId: row.id,
        slug: row.slug,
        title: row.title
      }))
    );
  }

  async countPossibleDuplicates(): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM entities.entities e
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND e.canonical_url IS NULL
    `;

    return Number(rows[0]?.count ?? 0);
  }

  async listPossibleDuplicates(limit: number): Promise<ContributeQueueItemRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));

    return this.prismaService.$queryRaw<ContributeQueueItemRow[]>`
      SELECT
        e.id AS "entityId",
        e.slug AS slug,
        e.title AS title
      FROM entities.entities e
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND e.canonical_url IS NULL
      ORDER BY e.created_at DESC
      LIMIT ${safeLimit}
    `;
  }

  async countTopsWithoutDescription(): Promise<number> {
    return this.prismaService.top.count({
      where: {
        OR: [{ description: null }, { description: "" }],
        visibility: "ACTIVE"
      }
    });
  }

  async listTopsWithoutDescription(limit: number): Promise<ContributeTopQueueItemRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));

    return this.prismaService.top.findMany({
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        slug: true,
        title: true
      },
      take: safeLimit,
      where: {
        OR: [{ description: null }, { description: "" }],
        visibility: "ACTIVE"
      }
    }).then((rows) =>
      rows.map((row) => ({
        slug: row.slug,
        title: row.title,
        topId: row.id
      }))
    );
  }

  async countLowActivityBattles(threshold = 3): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT pair_key
        FROM growth.battle_votes
        GROUP BY pair_key
        HAVING COUNT(*) < ${threshold}
      ) pairs
    `;

    return Number(rows[0]?.count ?? 0);
  }

  async listLowActivityBattles(limit: number, threshold = 3): Promise<ContributeBattleQueueItemRow[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));

    return this.prismaService.$queryRaw<ContributeBattleQueueItemRow[]>`
      WITH pair_stats AS (
        SELECT
          pair_key AS "pairKey",
          COUNT(*)::int AS "totalVotes"
        FROM growth.battle_votes
        GROUP BY pair_key
        HAVING COUNT(*) < ${threshold}
        ORDER BY COUNT(*) ASC, MAX(created_at) DESC
        LIMIT ${safeLimit}
      ),
      pair_entities AS (
        SELECT
          ps."pairKey",
          ps."totalVotes",
          split_part(ps."pairKey", ':', 1)::uuid AS left_id,
          split_part(ps."pairKey", ':', 2)::uuid AS right_id
        FROM pair_stats ps
      )
      SELECT
        pe."pairKey" AS "pairKey",
        pe."totalVotes" AS "totalVotes",
        left_entity.slug AS "leftSlug",
        right_entity.slug AS "rightSlug",
        left_entity.slug || '-vs-' || right_entity.slug AS "pairSlug"
      FROM pair_entities pe
      INNER JOIN entities.entities left_entity ON left_entity.id = pe.left_id
      INNER JOIN entities.entities right_entity ON right_entity.id = pe.right_id
      WHERE left_entity.visibility = 'ACTIVE'::entities.entity_visibility
        AND right_entity.visibility = 'ACTIVE'::entities.entity_visibility
    `;
  }
}
