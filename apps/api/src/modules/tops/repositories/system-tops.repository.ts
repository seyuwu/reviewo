import { Injectable } from "@nestjs/common";
import { Prisma } from "#prisma/client";
import type { Prisma as PrismaTypes } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import type { SystemTopDefinition } from "../system-top-definitions.js";
import {
  buildOrderSql,
  buildScoreExpression,
  sortRankedEntities,
  type TopRankedEntityRow
} from "../top-rank.utils.js";

export type SystemTopRankedEntityRow = TopRankedEntityRow;

export interface SystemTopSnapshotItem {
  entityId: string;
  position: number;
  score: number;
}

export interface SystemTopSnapshotRecord {
  computedAt: Date;
  definitionSlug: string;
  items: SystemTopSnapshotItem[];
}

export interface EntitySystemTopAppearanceRow {
  computedAt: Date;
  definitionSlug: string;
  position: number;
  score: number;
}

@Injectable()
export class SystemTopsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async computeRankedEntities(definition: SystemTopDefinition): Promise<SystemTopRankedEntityRow[]> {
    const safeLimit = Math.max(1, Math.min(definition.limit, 50));
    const filterSql = buildFilterSql(definition.filters);
    const orderSql = buildOrderSql(definition.sort);

    return this.prismaService.$queryRaw<SystemTopRankedEntityRow[]>`
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
        ${buildScoreExpression(definition.sort)} AS "score"
      FROM ratings.rating_aggregates ra
      INNER JOIN entities.entities e ON e.id = ra.entity_id
      LEFT JOIN reputation.entity_confidence_profiles ecp ON ecp.entity_id = e.id
      LEFT JOIN (
        SELECT entity_id, COUNT(*)::int AS review_count
        FROM reviews.reviews
        GROUP BY entity_id
      ) rc ON rc.entity_id = e.id
      WHERE e.visibility = 'ACTIVE'::entities.entity_visibility
        AND ra.votes_count >= ${definition.minVotes}
        ${filterSql}
      ORDER BY ${orderSql}
      LIMIT ${safeLimit}
    `;
  }

  async insertSnapshot(
    definitionSlug: string,
    items: SystemTopSnapshotItem[],
    entityTitles: Map<string, string>
  ): Promise<SystemTopSnapshotRecord> {
    const computedAt = new Date();
    const storedItems = items.map((item) => ({
      entityId: item.entityId,
      position: item.position,
      score: item.score,
      title: entityTitles.get(item.entityId) ?? ""
    }));

    const record = await this.prismaService.systemTopSnapshot.create({
      data: {
        computedAt,
        definitionSlug,
        items: storedItems as unknown as PrismaTypes.InputJsonValue
      }
    });

    return {
      computedAt: record.computedAt,
      definitionSlug: record.definitionSlug,
      items: parseSnapshotItems(record.items)
    };
  }

  async getLatestSnapshot(definitionSlug: string): Promise<SystemTopSnapshotRecord | null> {
    const record = await this.prismaService.systemTopSnapshot.findFirst({
      orderBy: { computedAt: "desc" },
      where: { definitionSlug }
    });

    if (!record) {
      return null;
    }

    return {
      computedAt: record.computedAt,
      definitionSlug: record.definitionSlug,
      items: parseSnapshotItems(record.items)
    };
  }

  async getLatestComputedAtBySlug(): Promise<Map<string, Date>> {
    const rows = await this.prismaService.$queryRaw<Array<{ computedAt: Date; definitionSlug: string }>>`
      SELECT DISTINCT ON (definition_slug)
        definition_slug AS "definitionSlug",
        computed_at AS "computedAt"
      FROM tops.system_top_snapshots
      ORDER BY definition_slug, computed_at DESC
    `;

    return new Map(rows.map((row) => [row.definitionSlug, row.computedAt]));
  }

  async listEntitySystemTopAppearances(entityId: string): Promise<
    Array<{
      computedAt: Date;
      definitionSlug: string;
      position: number;
      score: number;
    }>
  > {
    return this.prismaService.$queryRaw<
      Array<{
        computedAt: Date;
        definitionSlug: string;
        position: number;
        score: number;
      }>
    >`
      WITH latest AS (
        SELECT DISTINCT ON (definition_slug)
          definition_slug,
          computed_at,
          items
        FROM tops.system_top_snapshots
        ORDER BY definition_slug, computed_at DESC
      )
      SELECT
        latest.definition_slug AS "definitionSlug",
        latest.computed_at AS "computedAt",
        (entry.value->>'position')::int AS "position",
        (entry.value->>'score')::float8 AS "score"
      FROM latest
      CROSS JOIN LATERAL jsonb_array_elements(latest.items::jsonb) AS entry(value)
      WHERE entry.value->>'entityId' = ${entityId}
      ORDER BY latest.definition_slug ASC
    `;
  }
}

function buildFilterSql(filters: SystemTopDefinition["filters"]): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  const entityTypes = filters.entityTypes ?? [];

  if (entityTypes.length === 1) {
    parts.push(Prisma.sql`AND e.type = ${entityTypes[0]!}::entities.entity_type`);
  } else if (entityTypes.length > 1) {
    parts.push(Prisma.sql`AND e.type = ANY(${entityTypes}::entities.entity_type[])`);
  }

  if (filters.parentId === null) {
    parts.push(Prisma.sql`AND e.parent_id IS NULL`);
  } else if (filters.parentId) {
    parts.push(Prisma.sql`AND e.parent_id = ${filters.parentId}::uuid`);
  }

  if (parts.length === 0) {
    return Prisma.empty;
  }

  return Prisma.join(parts, " ");
}

function parseSnapshotItems(value: PrismaTypes.JsonValue): SystemTopSnapshotItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const entityId = record.entityId;
    const position = record.position;
    const score = record.score;

    if (typeof entityId !== "string" || typeof position !== "number" || typeof score !== "number") {
      return [];
    }

    return [{ entityId, position, score }];
  });
}

export function toSnapshotItems(rows: SystemTopRankedEntityRow[]): SystemTopSnapshotItem[] {
  return rows.map((row, index) => ({
    entityId: row.entityId,
    position: index + 1,
    score: row.score
  }));
}

export { sortRankedEntities } from "../top-rank.utils.js";
