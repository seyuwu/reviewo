import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";

@Injectable()
export class EntityQualityConfirmationsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async upsertConfirmations(input: {
    confirmerKey: string;
    entityId: string;
    qualityKeys: string[];
    voterUserId?: string | null;
  }): Promise<void> {
    if (input.qualityKeys.length === 0) {
      return;
    }

    await this.prismaService.$transaction(
      input.qualityKeys.map((qualityKey) =>
        this.prismaService.entityQualityConfirmation.upsert({
          create: {
            confirmerKey: input.confirmerKey,
            entityId: input.entityId,
            qualityKey,
            voterUserId: input.voterUserId ?? null
          },
          update: {
            voterUserId: input.voterUserId ?? null
          },
          where: {
            entityId_qualityKey_confirmerKey: {
              confirmerKey: input.confirmerKey,
              entityId: input.entityId,
              qualityKey
            }
          }
        })
      )
    );
  }

  async countDistinctConfirmers(entityId: string): Promise<number> {
    const rows = await this.prismaService.entityQualityConfirmation.findMany({
      distinct: ["confirmerKey"],
      select: {
        confirmerKey: true
      },
      where: {
        entityId
      }
    });

    return rows.length;
  }

  async countByQualityKey(entityId: string): Promise<Record<string, number>> {
    const rows = await this.prismaService.entityQualityConfirmation.groupBy({
      _count: {
        _all: true
      },
      by: ["qualityKey"],
      where: {
        entityId
      }
    });

    return Object.fromEntries(rows.map((row) => [row.qualityKey, row._count._all]));
  }

  async deleteConfirmation(input: {
    confirmerKey: string;
    entityId: string;
    qualityKey: string;
  }): Promise<void> {
    await this.prismaService.entityQualityConfirmation.deleteMany({
      where: {
        confirmerKey: input.confirmerKey,
        entityId: input.entityId,
        qualityKey: input.qualityKey
      }
    });
  }

  async listConfirmerQualityKeys(entityId: string, confirmerKey: string): Promise<string[]> {
    const rows = await this.prismaService.entityQualityConfirmation.findMany({
      select: {
        qualityKey: true
      },
      where: {
        confirmerKey,
        entityId
      }
    });

    return rows.map((row) => row.qualityKey);
  }

  async hasConfirmerForEntity(entityId: string, confirmerKey: string): Promise<boolean> {
    const row = await this.prismaService.entityQualityConfirmation.findFirst({
      select: {
        id: true
      },
      where: {
        confirmerKey,
        entityId
      }
    });

    return row !== null;
  }
}
