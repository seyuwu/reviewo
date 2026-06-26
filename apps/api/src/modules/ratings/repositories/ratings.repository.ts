import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Rating, RatingAggregate } from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

type PrismaClientOrTransaction = Prisma.TransactionClient | PrismaService;

export interface UpsertRatingInput {
  entityId: string;
  score: number;
  source: string;
  userId: string;
}

@Injectable()
export class RatingsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async runInTransaction<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prismaService.$transaction(callback);
  }

  async findUserRating(entityId: string, userId: string): Promise<Rating | null> {
    return this.prismaService.rating.findUnique({
      where: {
        entityId_userId: {
          entityId,
          userId
        }
      }
    });
  }

  async getAggregate(entityId: string): Promise<RatingAggregate | null> {
    return this.prismaService.ratingAggregate.findUnique({
      where: {
        entityId
      }
    });
  }

  async upsertRating(
    input: UpsertRatingInput,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<Rating> {
    return client.rating.upsert({
      create: {
        entityId: input.entityId,
        score: input.score,
        source: input.source,
        userId: input.userId
      },
      update: {
        score: input.score,
        source: input.source
      },
      where: {
        entityId_userId: {
          entityId: input.entityId,
          userId: input.userId
        }
      }
    });
  }

  async recalculateAggregate(
    entityId: string,
    client: PrismaClientOrTransaction = this.prismaService
  ): Promise<RatingAggregate> {
    const [summary, distribution] = await Promise.all([
      client.rating.aggregate({
        _avg: {
          score: true
        },
        _count: {
          _all: true
        },
        where: {
          entityId
        }
      }),
      client.rating.groupBy({
        _count: {
          _all: true
        },
        by: ["score"],
        where: {
          entityId
        }
      })
    ]);
    const distributionByScore = new Map(distribution.map((item) => [item.score, item._count._all]));
    const avgScore = Number((summary._avg.score ?? 0).toFixed(2));

    return client.ratingAggregate.upsert({
      create: {
        avgScore: new Prisma.Decimal(avgScore.toFixed(2)),
        distribution1: distributionByScore.get(1) ?? 0,
        distribution2: distributionByScore.get(2) ?? 0,
        distribution3: distributionByScore.get(3) ?? 0,
        distribution4: distributionByScore.get(4) ?? 0,
        distribution5: distributionByScore.get(5) ?? 0,
        entityId,
        votesCount: summary._count._all
      },
      update: {
        avgScore: new Prisma.Decimal(avgScore.toFixed(2)),
        distribution1: distributionByScore.get(1) ?? 0,
        distribution2: distributionByScore.get(2) ?? 0,
        distribution3: distributionByScore.get(3) ?? 0,
        distribution4: distributionByScore.get(4) ?? 0,
        distribution5: distributionByScore.get(5) ?? 0,
        votesCount: summary._count._all
      },
      where: {
        entityId
      }
    });
  }
}
