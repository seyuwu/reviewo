import { Prisma, TopSystemSortKey } from "#prisma/client";

import type { SystemTopSort } from "./system-top-definitions.js";

export interface TopRankedEntityRow {
  avgScore: number;
  entityId: string;
  reliability: number;
  score: number;
  slug: string;
  title: string;
  votesCount: number;
}

export function mapTopSystemSortKeyToSystemTopSort(sortKey: TopSystemSortKey): SystemTopSort {
  if (sortKey === TopSystemSortKey.POPULARITY || sortKey === TopSystemSortKey.TRENDING) {
    return "votes";
  }

  if (sortKey === TopSystemSortKey.RATING) {
    return "rating";
  }

  if (sortKey === TopSystemSortKey.RELIABILITY) {
    return "reliability";
  }

  return "composite";
}

export function buildScoreExpression(sort: SystemTopSort): Prisma.Sql {
  const reliabilityExpression = Prisma.sql`
    COALESCE(
      ecp.confidence_score::float8,
      LEAST(
        1.0::float8,
        (LEAST(ra.votes_count, 100)::float8 / 100.0) * 0.9
        + (LEAST(COALESCE(rc.review_count, 0), 20)::float8 / 20.0) * 0.1
      )
    )
  `;

  if (sort === "votes") {
    return Prisma.sql`ra.votes_count::float8`;
  }

  if (sort === "reliability") {
    return reliabilityExpression;
  }

  if (sort === "rating") {
    return Prisma.sql`ra.avg_score::float8`;
  }

  return Prisma.sql`
    (
      ra.avg_score::float8
      * ${reliabilityExpression}
      * ln(1 + ra.votes_count::float8)
    )
  `;
}

export function buildOrderSql(sort: SystemTopSort): Prisma.Sql {
  if (sort === "votes") {
    return Prisma.sql`ra.votes_count DESC, ra.avg_score DESC`;
  }

  if (sort === "reliability") {
    return Prisma.sql`"reliability" DESC, ra.votes_count DESC, ra.avg_score DESC`;
  }

  if (sort === "rating") {
    return Prisma.sql`ra.avg_score DESC, ra.votes_count DESC`;
  }

  return Prisma.sql`"score" DESC, ra.votes_count DESC, ra.avg_score DESC`;
}

export function sortRankedEntities(
  rows: TopRankedEntityRow[],
  sort: SystemTopSort
): TopRankedEntityRow[] {
  const sorted = [...rows];

  sorted.sort((left, right) => {
    const primary =
      sort === "votes"
        ? right.votesCount - left.votesCount
        : sort === "reliability"
          ? right.reliability - left.reliability
          : sort === "rating"
            ? right.avgScore - left.avgScore
            : right.score - left.score;

    if (primary !== 0) {
      return primary;
    }

    if (right.votesCount !== left.votesCount) {
      return right.votesCount - left.votesCount;
    }

    return right.avgScore - left.avgScore;
  });

  return sorted;
}
