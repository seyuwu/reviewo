import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";

@Injectable()
export class RecommendationEndorsementsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async countByRecommendationIds(recommendationIds: string[]): Promise<Map<string, number>> {
    if (recommendationIds.length === 0) {
      return new Map();
    }

    const rows = await this.prismaService.recommendationEndorsement.groupBy({
      _count: { _all: true },
      by: ["recommendationId"],
      where: { recommendationId: { in: recommendationIds } }
    });

    return new Map(rows.map((row) => [row.recommendationId, row._count._all]));
  }

  async listViewerEndorsedRecommendationIds(
    recommendationIds: string[],
    userId: string
  ): Promise<Set<string>> {
    if (recommendationIds.length === 0) {
      return new Set();
    }

    const rows = await this.prismaService.recommendationEndorsement.findMany({
      select: { recommendationId: true },
      where: {
        recommendationId: { in: recommendationIds },
        userId
      }
    });

    return new Set(rows.map((row) => row.recommendationId));
  }

  async hasEndorsement(recommendationId: string, userId: string): Promise<boolean> {
    const row = await this.prismaService.recommendationEndorsement.findUnique({
      select: { id: true },
      where: {
        recommendationId_userId: {
          recommendationId,
          userId
        }
      }
    });

    return Boolean(row);
  }

  async create(recommendationId: string, userId: string): Promise<number> {
    await this.prismaService.recommendationEndorsement.create({
      data: {
        recommendationId,
        userId
      }
    });

    return this.prismaService.recommendationEndorsement.count({
      where: { recommendationId }
    });
  }

  async remove(recommendationId: string, userId: string): Promise<number> {
    await this.prismaService.recommendationEndorsement.deleteMany({
      where: {
        recommendationId,
        userId
      }
    });

    return this.prismaService.recommendationEndorsement.count({
      where: { recommendationId }
    });
  }
}
