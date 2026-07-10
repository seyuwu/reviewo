import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import type { CuratorRankArea } from "../services/curator-rank-calculator.service.js";

@Injectable()
export class CuratorRankSnapshotRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async replaceForUser(userId: string, ranks: CuratorRankArea[]): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.userCuratorRankSnapshot.deleteMany({
        where: { userId }
      }),
      ...(ranks.length > 0
        ? [
            this.prismaService.userCuratorRankSnapshot.createMany({
              data: ranks.map((rank) => ({
                categoryId: rank.categoryId,
                score: rank.score,
                userId
              }))
            })
          ]
        : [])
    ]);
  }

  async listByUserId(userId: string) {
    return this.prismaService.userCuratorRankSnapshot.findMany({
      orderBy: { score: "desc" },
      where: { userId }
    });
  }

  async getCategoryStats(userId: string) {
    const tops = await this.prismaService.top.groupBy({
      _count: { _all: true },
      by: ["categoryId"],
      where: {
        authorId: userId,
        categoryId: { not: null },
        visibility: "ACTIVE"
      }
    });

    const likes = await this.prismaService.$queryRaw<
      Array<{ category_id: string; likes_received: bigint }>
    >`
      SELECT t.category_id, COUNT(tl.id)::bigint AS likes_received
      FROM tops.tops t
      INNER JOIN tops.top_likes tl ON tl.top_id = t.id
      WHERE t.author_id = ${userId}::uuid
        AND t.category_id IS NOT NULL
        AND t.visibility = 'ACTIVE'
      GROUP BY t.category_id
    `;

    const forks = await this.prismaService.$queryRaw<
      Array<{ category_id: string; forks_received: bigint }>
    >`
      SELECT t.category_id, COUNT(f.id)::bigint AS forks_received
      FROM tops.tops t
      INNER JOIN tops.tops f ON f.forked_from_id = t.id
      WHERE t.author_id = ${userId}::uuid
        AND t.category_id IS NOT NULL
        AND t.visibility = 'ACTIVE'
        AND f.visibility = 'ACTIVE'
      GROUP BY t.category_id
    `;

    const likesByCategory = new Map(
      likes.map((row) => [row.category_id, Number(row.likes_received)])
    );
    const forksByCategory = new Map(
      forks.map((row) => [row.category_id, Number(row.forks_received)])
    );
    const categoryIds = new Set<string>();

    for (const row of tops) {
      if (row.categoryId) {
        categoryIds.add(row.categoryId);
      }
    }

    for (const categoryId of likesByCategory.keys()) {
      categoryIds.add(categoryId);
    }

    for (const categoryId of forksByCategory.keys()) {
      categoryIds.add(categoryId);
    }

    return [...categoryIds].map((categoryId) => ({
      categoryId,
      forksReceived: forksByCategory.get(categoryId) ?? 0,
      likesReceived: likesByCategory.get(categoryId) ?? 0,
      topsCreated: tops.find((row) => row.categoryId === categoryId)?._count._all ?? 0
    }));
  }

  async countRecognitionReceived(userId: string): Promise<{
    forksReceivedCount: number;
    likesReceivedCount: number;
  }> {
    const [likesRow] = await this.prismaService.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(tl.id)::bigint AS count
      FROM tops.tops t
      INNER JOIN tops.top_likes tl ON tl.top_id = t.id
      WHERE t.author_id = ${userId}::uuid
        AND t.visibility = 'ACTIVE'
    `;

    const [forksRow] = await this.prismaService.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(f.id)::bigint AS count
      FROM tops.tops t
      INNER JOIN tops.tops f ON f.forked_from_id = t.id
      WHERE t.author_id = ${userId}::uuid
        AND t.visibility = 'ACTIVE'
        AND f.visibility = 'ACTIVE'
    `;

    return {
      forksReceivedCount: Number(forksRow?.count ?? 0),
      likesReceivedCount: Number(likesRow?.count ?? 0)
    };
  }
}
