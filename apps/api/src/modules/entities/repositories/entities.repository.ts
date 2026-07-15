import { Injectable } from "@nestjs/common";
import type { Entity, EntityType, EntityVisibility, Prisma } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import { createSlug } from "../services/entity-slug.js";
import { slugPrefixForDuplicateSearch } from "../utils/title-duplicate-match.js";
import type { SearchEntityMetrics } from "../services/search-ranking.js";

export interface CreateEntityRecordInput {
  canonicalUrl?: string;
  createdBy: string | null;
  description?: string;
  ownerUserId?: string;
  parentId?: string;
  slug: string;
  title: string;
  type: EntityType;
}

@Injectable()
export class EntitiesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(input: CreateEntityRecordInput): Promise<Entity> {
    const data: Prisma.EntityUncheckedCreateInput = {
      createdBy: input.createdBy,
      slug: input.slug,
      title: input.title,
      type: input.type
    };

    if (input.canonicalUrl) {
      data.canonicalUrl = input.canonicalUrl;
    }

    if (input.description) {
      data.description = input.description;
    }

    if (input.parentId) {
      data.parentId = input.parentId;
    }

    if (input.ownerUserId) {
      data.ownerUserId = input.ownerUserId;
    }

    return this.prismaService.entity.create({
      data
    });
  }

  async findById(id: string): Promise<Entity | null> {
    return this.prismaService.entity.findUnique({
      where: {
        id
      }
    });
  }

  async findByCanonicalUrl(canonicalUrl: string): Promise<Entity | null> {
    return this.prismaService.entity.findUnique({
      where: {
        canonicalUrl
      }
    });
  }

  async findBySlug(slug: string): Promise<Entity | null> {
    return this.prismaService.entity.findUnique({
      where: {
        slug
      }
    });
  }

  async findByOwnerUserId(ownerUserId: string): Promise<Entity | null> {
    return this.prismaService.entity.findFirst({
      where: {
        ownerUserId,
        type: "person"
      }
    });
  }

  async search(query: string): Promise<Entity[]> {
    const normalizedQuery = query.trim();
    const slugPattern = normalizedQuery.toLowerCase().replace(/\s+/g, "-");
    const titleSlug = createSlug(normalizedQuery);
    const titleSlugPrefix = slugPrefixForDuplicateSearch(titleSlug);

    const filters: Prisma.EntityWhereInput[] = [
      {
        title: {
          contains: normalizedQuery,
          mode: "insensitive"
        }
      },
      {
        slug: {
          contains: slugPattern,
          mode: "insensitive"
        }
      },
      {
        canonicalUrl: {
          contains: normalizedQuery,
          mode: "insensitive"
        }
      }
    ];

    if (titleSlug.length >= 2) {
      filters.push(
        {
          slug: {
            equals: titleSlug,
            mode: "insensitive"
          }
        },
        {
          slug: {
            startsWith: `${titleSlug}-`,
            mode: "insensitive"
          }
        }
      );
    }

    if (titleSlugPrefix) {
      filters.push({
        slug: {
          startsWith: titleSlugPrefix,
          mode: "insensitive"
        }
      });
    }

    return this.prismaService.entity.findMany({
      take: 20,
      where: {
        OR: filters,
        visibility: "ACTIVE"
      }
    });
  }

  async getSearchMetricsByEntityIds(entityIds: string[]): Promise<Map<string, SearchEntityMetrics>> {
    if (entityIds.length === 0) {
      return new Map();
    }

    const [aggregates, reviewCounts] = await Promise.all([
      this.prismaService.ratingAggregate.findMany({
        where: {
          entityId: {
            in: entityIds
          }
        }
      }),
      this.prismaService.review.groupBy({
        _count: {
          _all: true
        },
        by: ["entityId"],
        where: {
          entityId: {
            in: entityIds
          },
          visibility: "ACTIVE"
        }
      })
    ]);

    const metricsByEntityId = new Map<string, SearchEntityMetrics>();

    for (const entityId of entityIds) {
      metricsByEntityId.set(entityId, {
        avgScore: null,
        reviewsCount: 0,
        votesCount: 0
      });
    }

    for (const aggregate of aggregates) {
      const existingMetrics = metricsByEntityId.get(aggregate.entityId) ?? {
        avgScore: null,
        reviewsCount: 0,
        votesCount: 0
      };

      metricsByEntityId.set(aggregate.entityId, {
        ...existingMetrics,
        avgScore: aggregate.votesCount > 0 ? Number(aggregate.avgScore) : null,
        votesCount: aggregate.votesCount
      });
    }

    for (const reviewCount of reviewCounts) {
      const existingMetrics = metricsByEntityId.get(reviewCount.entityId) ?? {
        avgScore: null,
        reviewsCount: 0,
        votesCount: 0
      };

      metricsByEntityId.set(reviewCount.entityId, {
        ...existingMetrics,
        reviewsCount: reviewCount._count._all
      });
    }

    return metricsByEntityId;
  }

  async findChildrenByParentId(parentId: string, limit: number): Promise<Entity[]> {
    return this.prismaService.entity.findMany({
      orderBy: {
        updatedAt: "desc"
      },
      take: limit,
      where: {
        parentId,
        visibility: "ACTIVE"
      }
    });
  }

  async updateVisibility(id: string, visibility: EntityVisibility): Promise<Entity> {
    return this.prismaService.entity.update({
      data: {
        visibility
      },
      where: {
        id
      }
    });
  }

  async updateLogoUrl(id: string, logoUrl: string | null): Promise<Entity> {
    return this.prismaService.entity.update({
      data: {
        logoUrl
      },
      where: {
        id
      }
    });
  }

  async updateTitle(id: string, title: string): Promise<Entity> {
    return this.prismaService.entity.update({
      data: {
        title
      },
      where: {
        id
      }
    });
  }

  /** Next free "Dota player N" title for anonymous / default guest profiles. */
  async nextDefaultDotaPlayerTitle(): Promise<string> {
    const rows = await this.prismaService.entity.findMany({
      select: {
        title: true
      },
      where: {
        OR: [
          {
            title: {
              equals: "Dota player",
              mode: "insensitive"
            }
          },
          {
            title: {
              startsWith: "Dota player ",
              mode: "insensitive"
            }
          }
        ],
        type: "person"
      }
    });

    let max = 0;

    for (const row of rows) {
      const match = /^dota player(?:\s+(\d+))?$/i.exec(row.title.trim());

      if (!match) {
        continue;
      }

      const parsed = match[1] ? Number.parseInt(match[1], 10) : 1;

      if (Number.isFinite(parsed) && parsed > max) {
        max = parsed;
      }
    }

    return `Dota player ${max + 1}`;
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
