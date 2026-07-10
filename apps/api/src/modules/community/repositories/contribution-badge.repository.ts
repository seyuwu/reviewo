import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import type { ContributionBadgeKey } from "../constants/contribution-badge.js";

@Injectable()
export class ContributionBadgeRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async replaceForUser(userId: string, badgeKeys: ContributionBadgeKey[]): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.userContributionBadge.deleteMany({
        where: { userId }
      }),
      ...(badgeKeys.length > 0
        ? [
            this.prismaService.userContributionBadge.createMany({
              data: badgeKeys.map((badgeKey) => ({
                badgeKey,
                userId
              }))
            })
          ]
        : [])
    ]);
  }

  async listByUserId(userId: string): Promise<string[]> {
    const rows = await this.prismaService.userContributionBadge.findMany({
      orderBy: { earnedAt: "asc" },
      select: { badgeKey: true },
      where: { userId }
    });

    return rows.map((row) => row.badgeKey);
  }
}
