import { Injectable } from "@nestjs/common";
import type { Entity, Rating, User } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface EntityRatingStats {
  firstRatingAt: Date | null;
  lastRatingAt: Date | null;
  scores: number[];
  uniqueRatersCount: number;
}

@Injectable()
export class ReputationReadRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findUserById(userId: string): Promise<User | null> {
    return this.prismaService.user.findUnique({
      where: {
        id: userId
      }
    });
  }

  async findEntityById(entityId: string): Promise<Entity | null> {
    return this.prismaService.entity.findUnique({
      where: {
        id: entityId
      }
    });
  }

  async findParentEntity(parentId: string | null): Promise<Entity | null> {
    if (!parentId) {
      return null;
    }

    return this.prismaService.entity.findUnique({
      where: {
        id: parentId
      }
    });
  }

  async findRatingById(ratingId: string): Promise<Rating | null> {
    return this.prismaService.rating.findUnique({
      where: {
        id: ratingId
      }
    });
  }

  async getEntityRatingStats(entityId: string): Promise<EntityRatingStats> {
    const ratings = await this.prismaService.rating.findMany({
      orderBy: {
        createdAt: "asc"
      },
      select: {
        createdAt: true,
        score: true,
        userId: true
      },
      where: {
        entityId
      }
    });

    if (ratings.length === 0) {
      return {
        firstRatingAt: null,
        lastRatingAt: null,
        scores: [],
        uniqueRatersCount: 0
      };
    }

    return {
      firstRatingAt: ratings[0]?.createdAt ?? null,
      lastRatingAt: ratings.at(-1)?.createdAt ?? null,
      scores: ratings.map((rating) => rating.score),
      uniqueRatersCount: new Set(ratings.map((rating) => rating.userId)).size
    };
  }

  async countRatingsInWindow(entityId: string, windowStart: Date): Promise<number> {
    return this.prismaService.rating.count({
      where: {
        createdAt: {
          gte: windowStart
        },
        entityId
      }
    });
  }

  async countDistinctRatersInWindow(entityId: string, windowStart: Date): Promise<number> {
    const ratings = await this.prismaService.rating.findMany({
      distinct: ["userId"],
      select: {
        userId: true
      },
      where: {
        createdAt: {
          gte: windowStart
        },
        entityId
      }
    });

    return ratings.length;
  }

  async getRatingAggregate(entityId: string): Promise<{
    avgScore: number;
    votesCount: number;
  } | null> {
    const aggregate = await this.prismaService.ratingAggregate.findUnique({
      where: {
        entityId
      }
    });

    if (!aggregate) {
      return null;
    }

    return {
      avgScore: Number(aggregate.avgScore),
      votesCount: aggregate.votesCount
    };
  }

  async listRatingsForBackfill(cursor: string | null, batchSize: number): Promise<Rating[]> {
    return this.prismaService.rating.findMany({
      orderBy: {
        createdAt: "asc"
      },
      take: batchSize,
      ...(cursor
        ? {
            cursor: {
              id: cursor
            },
            skip: 1
          }
        : {}),
      where: {
        ...(cursor
          ? {}
          : {})
      }
    });
  }
}
