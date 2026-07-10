import { Injectable } from "@nestjs/common";
import { Prisma, type Top, TopItem, TopRankMode, TopSystemSortKey, TopVisibility } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import {
  buildTopListOrderBy,
  normalizeTopListSort,
  type TopListSort
} from "../constants/top-list-sort.js";
import { buildTopLocaleWhere, type TopListLocaleFilter } from "../lib/top-locale-filter.js";

export interface CreateTopRecordInput {
  authorId: string;
  categoryId?: string | null;
  description?: string | null;
  locale?: string;
  rankMode?: TopRankMode;
  slug: string;
  systemSortKey?: TopSystemSortKey | null;
  title: string;
}

export interface UpdateTopRecordInput {
  categoryId?: string | null;
  description?: string | null;
  rankMode?: TopRankMode;
  systemSortKey?: TopSystemSortKey | null;
  title?: string;
}

export interface ReplaceTopItemInput {
  entityId: string;
  note?: string | null;
  position: number;
}

export type TopForkParent = {
  authorId: string;
  slug: string;
  title: string;
};

export type TopWithItems = Top & {
  _count: {
    comments: number;
    forks: number;
    likes: number;
    views: number;
  };
  category: TopCategoryRelation | null;
  forkedFrom: TopForkParent | null;
  items: TopItem[];
};

export type TopListRow = Top & {
  _count: {
    comments: number;
    forks: number;
    items: number;
    likes: number;
    views: number;
  };
  category: TopCategoryRelation | null;
};

type TopCategoryRelation = {
  slug: string;
  title: string;
};

const topCategorySelect = {
  select: {
    slug: true,
    title: true
  }
} as const;

const topListInclude = {
  _count: {
    select: {
      comments: true,
      forks: true,
      items: true,
      likes: true,
      views: true
    }
  },
  category: topCategorySelect
} as const;

const topWithItemsInclude = {
  _count: {
    select: {
      comments: true,
      forks: true,
      likes: true,
      views: true
    }
  },
  category: topCategorySelect,
  forkedFrom: {
    select: {
      authorId: true,
      slug: true,
      title: true
    }
  },
  items: {
    orderBy: { position: "asc" as const }
  }
} as const;

@Injectable()
export class TopsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(input: CreateTopRecordInput): Promise<Top> {
    return this.prismaService.top.create({
      data: {
        authorId: input.authorId,
        categoryId: input.categoryId ?? null,
        description: input.description ?? null,
        locale: input.locale ?? "ru",
        rankMode: input.rankMode ?? "MANUAL",
        slug: input.slug,
        systemSortKey: input.systemSortKey ?? null,
        title: input.title
      }
    });
  }

  async findById(id: string): Promise<Top | null> {
    return this.prismaService.top.findUnique({
      where: { id }
    });
  }

  async findBySlug(slug: string): Promise<TopWithItems | null> {
    return this.prismaService.top.findUnique({
      include: topWithItemsInclude,
      where: { slug }
    }) as Promise<TopWithItems | null>;
  }

  async findActiveBySlug(slug: string): Promise<TopWithItems | null> {
    return this.prismaService.top.findFirst({
      include: topWithItemsInclude,
      where: {
        slug,
        visibility: "ACTIVE"
      }
    }) as Promise<TopWithItems | null>;
  }

  async findActiveById(id: string): Promise<TopWithItems | null> {
    return this.prismaService.top.findFirst({
      include: topWithItemsInclude,
      where: {
        id,
        visibility: "ACTIVE"
      }
    }) as Promise<TopWithItems | null>;
  }

  async createFork(input: {
    authorId: string;
    slug: string;
    sourceTop: TopWithItems;
    title: string;
  }): Promise<TopWithItems> {
    return this.prismaService.$transaction(async (tx) => {
      const created = await tx.top.create({
        data: {
          authorId: input.authorId,
          categoryId: input.sourceTop.categoryId,
          description: input.sourceTop.description,
          forkedFromId: input.sourceTop.id,
          locale: input.sourceTop.locale,
          rankMode: "HYBRID",
          slug: input.slug,
          systemSortKey: "RELIABILITY",
          title: input.title
        }
      });

      if (input.sourceTop.items.length > 0) {
        await tx.topItem.createMany({
          data: input.sourceTop.items.map((item) => ({
            entityId: item.entityId,
            note: item.note,
            position: item.position,
            topId: created.id
          }))
        });
      }

      return tx.top.findUniqueOrThrow({
        include: topWithItemsInclude,
        where: { id: created.id }
      }) as Promise<TopWithItems>;
    });
  }

  async listForks(params: {
    cursor?: string;
    limit: number;
    localeFilter?: TopListLocaleFilter;
    sourceTopId: string;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    const localeWhere = buildTopLocaleWhere(params.localeFilter);

    const rows = await this.prismaService.top.findMany({
      include: topListInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      where: {
        forkedFromId: params.sourceTopId,
        visibility: "ACTIVE",
        ...localeWhere,
        ...(params.cursor
          ? {
              OR: [
                {
                  createdAt: {
                    lt: decodeCursor(params.cursor).createdAt
                  }
                },
                {
                  AND: [
                    {
                      createdAt: decodeCursor(params.cursor).createdAt
                    },
                    {
                      id: {
                        lt: decodeCursor(params.cursor).id
                      }
                    }
                  ]
                }
              ]
            }
          : {})
      }
    });

    const hasMore = rows.length > params.limit;
    const items = hasMore ? rows.slice(0, params.limit) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({
              createdAt: last.createdAt,
              id: last.id
            })
          : null
    };
  }

  async slugExists(slug: string): Promise<boolean> {
    const count = await this.prismaService.top.count({
      where: { slug }
    });

    return count > 0;
  }

  async update(id: string, input: UpdateTopRecordInput): Promise<Top> {
    return this.prismaService.top.update({
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.rankMode !== undefined ? { rankMode: input.rankMode } : {}),
        ...(input.systemSortKey !== undefined ? { systemSortKey: input.systemSortKey } : {})
      },
      where: { id }
    });
  }

  async updateVisibility(id: string, visibility: TopVisibility): Promise<Top> {
    return this.prismaService.top.update({
      data: { visibility },
      where: { id }
    });
  }

  async replaceItems(topId: string, items: ReplaceTopItemInput[]): Promise<TopWithItems> {
    return this.prismaService.$transaction(async (tx) => {
      await tx.topItem.deleteMany({
        where: { topId }
      });

      if (items.length > 0) {
        await tx.topItem.createMany({
          data: items.map((item) => ({
            entityId: item.entityId,
            note: item.note ?? null,
            position: item.position,
            topId
          }))
        });
      }

      return tx.top.findUniqueOrThrow({
        include: topWithItemsInclude,
        where: { id: topId }
      }) as Promise<TopWithItems>;
    });
  }

  async listPublished(params: {
    categoryId?: string;
    cursor?: string;
    limit: number;
    localeFilter?: TopListLocaleFilter;
    searchQuery?: string;
    sort?: TopListSort | string | null;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    const sort = normalizeTopListSort(params.sort);
    const localeWhere = buildTopLocaleWhere(params.localeFilter);

    if (sort === "random") {
      return this.listPublishedRandom({
        limit: params.limit,
        ...(params.localeFilter ? { localeFilter: params.localeFilter } : {}),
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        ...(params.searchQuery ? { searchQuery: params.searchQuery } : {})
      });
    }

    const orderBy = buildTopListOrderBy(sort);
    const useCursor = sort === "recent" && Boolean(params.cursor);

    const rows = await this.prismaService.top.findMany({
      include: topListInclude,
      orderBy,
      take: params.limit + 1,
      where: {
        visibility: "ACTIVE",
        ...localeWhere,
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
        ...(params.searchQuery
          ? {
              title: {
                contains: params.searchQuery,
                mode: "insensitive"
              }
            }
          : {}),
        ...(useCursor && params.cursor
          ? {
              OR: [
                {
                  createdAt: {
                    lt: decodeCursor(params.cursor).createdAt
                  }
                },
                {
                  AND: [
                    {
                      createdAt: decodeCursor(params.cursor).createdAt
                    },
                    {
                      id: {
                        lt: decodeCursor(params.cursor).id
                      }
                    }
                  ]
                }
              ]
            }
          : {})
      }
    });

    const hasMore = rows.length > params.limit;
    const items = (hasMore ? rows.slice(0, params.limit) : rows) as TopListRow[];
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        sort === "recent" && hasMore && last
          ? encodeCursor({
              createdAt: last.createdAt,
              id: last.id
            })
          : null
    };
  }

  async listRecent(params: {
    cursor?: string;
    limit: number;
    localeFilter?: TopListLocaleFilter;
    searchQuery?: string;
    sort?: TopListSort | string | null;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    return this.listPublished(params);
  }

  async listPublishedRandom(params: {
    categoryId?: string;
    limit: number;
    localeFilter?: TopListLocaleFilter;
    searchQuery?: string;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    const searchPattern = params.searchQuery ? `%${params.searchQuery}%` : null;
    const locale = params.localeFilter?.locale;
    const idRows = await this.prismaService.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT t.id
      FROM tops.tops t
      WHERE t.visibility = 'ACTIVE'::tops.top_visibility
      ${params.categoryId ? Prisma.sql`AND t.category_id = ${params.categoryId}::uuid` : Prisma.empty}
      ${searchPattern ? Prisma.sql`AND t.title ILIKE ${searchPattern}` : Prisma.empty}
      ${locale && locale !== "all" ? Prisma.sql`AND t.locale = ${locale}` : Prisma.empty}
      ORDER BY RANDOM()
      LIMIT ${params.limit}
    `);

    const ids = idRows.map((row) => row.id);

    if (ids.length === 0) {
      return { items: [], nextCursor: null };
    }

    const rows = await this.prismaService.top.findMany({
      include: topListInclude,
      where: {
        id: {
          in: ids
        }
      }
    });
    const order = new Map(ids.map((id, index) => [id, index]));

    rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));

    return {
      items: rows as TopListRow[],
      nextCursor: null
    };
  }

  async listByAuthor(params: {
    authorId: string;
    cursor?: string;
    limit: number;
    localeFilter?: TopListLocaleFilter;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    const localeWhere = buildTopLocaleWhere(params.localeFilter);

    const rows = await this.prismaService.top.findMany({
      include: topListInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      where: {
        authorId: params.authorId,
        visibility: "ACTIVE",
        ...localeWhere,
        ...(params.cursor
          ? {
              OR: [
                {
                  createdAt: {
                    lt: decodeCursor(params.cursor).createdAt
                  }
                },
                {
                  AND: [
                    {
                      createdAt: decodeCursor(params.cursor).createdAt
                    },
                    {
                      id: {
                        lt: decodeCursor(params.cursor).id
                      }
                    }
                  ]
                }
              ]
            }
          : {})
      }
    });

    const hasMore = rows.length > params.limit;
    const items = hasMore ? rows.slice(0, params.limit) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({
              createdAt: last.createdAt,
              id: last.id
            })
          : null
    };
  }

  async listByCategory(params: {
    categoryId: string;
    cursor?: string;
    limit: number;
    localeFilter?: TopListLocaleFilter;
    searchQuery?: string;
    sort?: TopListSort | string | null;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    return this.listPublished({
      categoryId: params.categoryId,
      limit: params.limit,
      ...(params.localeFilter ? { localeFilter: params.localeFilter } : {}),
      ...(params.searchQuery ? { searchQuery: params.searchQuery } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.sort !== undefined ? { sort: params.sort } : {})
    });
  }

  async listAppearancesForEntity(
    entityId: string,
    localeFilter?: TopListLocaleFilter
  ): Promise<
    Array<{
      position: number;
      slug: string;
      title: string;
      topId: string;
    }>
  > {
    const localeWhere = buildTopLocaleWhere(localeFilter);

    const rows = await this.prismaService.topItem.findMany({
      include: {
        top: {
          select: {
            id: true,
            slug: true,
            title: true,
            visibility: true
          }
        }
      },
      orderBy: {
        top: {
          createdAt: "desc"
        }
      },
      where: {
        entityId,
        top: {
          visibility: "ACTIVE",
          ...localeWhere
        }
      }
    });

    return rows.map((row) => ({
      position: row.position,
      slug: row.top.slug,
      title: row.top.title,
      topId: row.top.id
    }));
  }

  async countActiveItems(topId: string): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM tops.top_items ti
      INNER JOIN entities.entities e ON e.id = ti.entity_id
      WHERE ti.top_id = ${topId}::uuid
        AND e.visibility = 'ACTIVE'::entities.entity_visibility
    `;

    return Number(rows[0]?.count ?? 0);
  }

  async countActiveItemsByTopIds(topIds: string[]): Promise<Map<string, number>> {
    if (topIds.length === 0) {
      return new Map();
    }

    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint; topId: string }>>`
      SELECT ti.top_id AS "topId", COUNT(*)::bigint AS count
      FROM tops.top_items ti
      INNER JOIN entities.entities e ON e.id = ti.entity_id
      WHERE ti.top_id = ANY(${topIds}::uuid[])
        AND e.visibility = 'ACTIVE'::entities.entity_visibility
      GROUP BY ti.top_id
    `;

    const counts = new Map<string, number>();

    for (const row of rows) {
      counts.set(row.topId, Number(row.count));
    }

    return counts;
  }

  async findActiveTopIdsForEntities(entityIds: string[]): Promise<string[]> {
    if (entityIds.length === 0) {
      return [];
    }

    const rows = await this.prismaService.$queryRaw<Array<{ topId: string }>>`
      SELECT DISTINCT ti.top_id AS "topId"
      FROM tops.top_items ti
      INNER JOIN tops.tops t ON t.id = ti.top_id
      WHERE ti.entity_id = ANY(${entityIds}::uuid[])
        AND t.visibility = 'ACTIVE'::tops.top_visibility
    `;

    return rows.map((row) => row.topId);
  }

  isUniqueConstraintError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}

function encodeCursor(value: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: value.createdAt.toISOString(),
      id: value.id
    })
  ).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
    createdAt: string;
    id: string;
  };

  return {
    createdAt: new Date(parsed.createdAt),
    id: parsed.id
  };
}
