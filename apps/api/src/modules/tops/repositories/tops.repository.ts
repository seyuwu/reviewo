import { Injectable } from "@nestjs/common";
import type { Prisma, Top, TopItem, TopRankMode, TopSystemSortKey, TopVisibility } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import {
  buildTopListOrderBy,
  normalizeTopListSort,
  type TopListSort
} from "../constants/top-list-sort.js";

export interface CreateTopRecordInput {
  authorId: string;
  categoryId?: string | null;
  description?: string | null;
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
    sourceTopId: string;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    const rows = await this.prismaService.top.findMany({
      include: topListInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      where: {
        forkedFromId: params.sourceTopId,
        visibility: "ACTIVE",
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
    sort?: TopListSort | string | null;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    const sort = normalizeTopListSort(params.sort);
    const orderBy = buildTopListOrderBy(sort);
    const useCursor = sort === "recent" && Boolean(params.cursor);

    const rows = await this.prismaService.top.findMany({
      include: topListInclude,
      orderBy,
      take: params.limit + 1,
      where: {
        visibility: "ACTIVE",
        ...(params.categoryId ? { categoryId: params.categoryId } : {}),
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
    sort?: TopListSort | string | null;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    return this.listPublished(params);
  }

  async listByAuthor(params: {
    authorId: string;
    cursor?: string;
    limit: number;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    const rows = await this.prismaService.top.findMany({
      include: topListInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: params.limit + 1,
      where: {
        authorId: params.authorId,
        visibility: "ACTIVE",
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
    sort?: TopListSort | string | null;
  }): Promise<{ items: TopListRow[]; nextCursor: string | null }> {
    return this.listPublished({
      categoryId: params.categoryId,
      limit: params.limit,
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.sort !== undefined ? { sort: params.sort } : {})
    });
  }

  async listAppearancesForEntity(entityId: string): Promise<
    Array<{
      position: number;
      slug: string;
      title: string;
      topId: string;
    }>
  > {
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
          visibility: "ACTIVE"
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
