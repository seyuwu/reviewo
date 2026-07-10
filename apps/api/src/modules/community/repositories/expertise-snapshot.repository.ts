import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import type { ExpertiseArea } from "../services/expertise-calculator.service.js";

@Injectable()
export class ExpertiseSnapshotRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async replaceForUser(userId: string, areas: ExpertiseArea[]): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.userExpertiseSnapshot.deleteMany({
        where: { userId }
      }),
      ...(areas.length > 0
        ? [
            this.prismaService.userExpertiseSnapshot.createMany({
              data: areas.map((area) => ({
                scopeKey: area.scopeKey,
                scopeType: area.scopeType,
                score: area.score,
                userId
              }))
            })
          ]
        : [])
    ]);
  }

  async listByUserId(userId: string) {
    return this.prismaService.userExpertiseSnapshot.findMany({
      orderBy: { score: "desc" },
      where: { userId }
    });
  }
}
