import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";

@Injectable()
export class BattleVoteRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findVote(pairKey: string, voterKey: string) {
    return this.prismaService.battleVote.findUnique({
      where: {
        pairKey_voterKey: {
          pairKey,
          voterKey
        }
      }
    });
  }

  async createVote(input: {
    entityId: string;
    pairKey: string;
    userId?: string | null;
    voterKey: string;
  }) {
    return this.prismaService.battleVote.create({
      data: {
        entityId: input.entityId,
        pairKey: input.pairKey,
        userId: input.userId ?? null,
        voterKey: input.voterKey
      }
    });
  }

  async updateVote(input: {
    entityId: string;
    pairKey: string;
    userId?: string | null;
    voterKey: string;
  }) {
    return this.prismaService.battleVote.update({
      data: {
        entityId: input.entityId,
        ...(input.userId ? { userId: input.userId } : {})
      },
      where: {
        pairKey_voterKey: {
          pairKey: input.pairKey,
          voterKey: input.voterKey
        }
      }
    });
  }

  async countVotesByEntity(pairKey: string): Promise<Map<string, number>> {
    const rows = await this.prismaService.battleVote.groupBy({
      by: ["entityId"],
      _count: {
        entityId: true
      },
      where: {
        pairKey
      }
    });

    return new Map(rows.map((row) => [row.entityId, row._count.entityId]));
  }
}
