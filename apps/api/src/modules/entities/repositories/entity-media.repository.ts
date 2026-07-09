import { Injectable } from "@nestjs/common";
import type { EntityMedia, EntityMediaSource, EntityMediaType, Prisma } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import { ENTITY_MEDIA_AUTO_SOURCES, ENTITY_MEDIA_MANUAL_SOURCES } from "../constants/entity-media.js";

@Injectable()
export class EntityMediaRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async upsertLogo(input: {
    entityId: string;
    source: EntityMediaSource;
    trustScore: Prisma.Decimal | number | string;
    url: string;
  }): Promise<EntityMedia> {
    return this.prismaService.entityMedia.upsert({
      create: {
        entityId: input.entityId,
        source: input.source,
        trustScore: input.trustScore,
        type: "LOGO",
        url: input.url
      },
      update: {
        trustScore: input.trustScore,
        url: input.url
      },
      where: {
        entityId_type_source: {
          entityId: input.entityId,
          source: input.source,
          type: "LOGO"
        }
      }
    });
  }

  async findPrimaryLogo(entityId: string): Promise<EntityMedia | null> {
    return this.prismaService.entityMedia.findFirst({
      orderBy: [{ trustScore: "desc" }, { updatedAt: "desc" }],
      where: {
        entityId,
        type: "LOGO"
      }
    });
  }

  async hasHighTrustLogo(entityId: string, threshold: number): Promise<boolean> {
    const media = await this.prismaService.entityMedia.findFirst({
      orderBy: [{ trustScore: "desc" }, { updatedAt: "desc" }],
      where: {
        entityId,
        trustScore: {
          gte: threshold
        },
        type: "LOGO"
      }
    });

    return media !== null;
  }

  async deleteLogoBySources(entityId: string, sources: EntityMediaSource[]): Promise<void> {
    if (sources.length === 0) {
      return;
    }

    await this.prismaService.entityMedia.deleteMany({
      where: {
        entityId,
        source: {
          in: sources
        },
        type: "LOGO"
      }
    });
  }

  async deleteAutoLogos(entityId: string): Promise<void> {
    await this.deleteLogoBySources(entityId, [...ENTITY_MEDIA_AUTO_SOURCES]);
  }

  async deleteManualLogos(entityId: string): Promise<void> {
    await this.deleteLogoBySources(entityId, [...ENTITY_MEDIA_MANUAL_SOURCES]);
  }

  async listByEntityId(entityId: string): Promise<EntityMedia[]> {
    return this.prismaService.entityMedia.findMany({
      orderBy: [{ type: "asc" }, { trustScore: "desc" }, { updatedAt: "desc" }],
      where: {
        entityId
      }
    });
  }

  async moveMediaToEntity(
    transaction: Prisma.TransactionClient,
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<void> {
    const sourceMedia = await transaction.entityMedia.findMany({
      where: {
        entityId: sourceEntityId
      }
    });

    for (const media of sourceMedia) {
      const existingTargetMedia = await transaction.entityMedia.findUnique({
        where: {
          entityId_type_source: {
            entityId: targetEntityId,
            source: media.source,
            type: media.type
          }
        }
      });

      if (!existingTargetMedia) {
        await transaction.entityMedia.update({
          data: {
            entityId: targetEntityId
          },
          where: {
            id: media.id
          }
        });
        continue;
      }

      const sourceTrust = Number(media.trustScore);
      const targetTrust = Number(existingTargetMedia.trustScore);
      const sourceIsNewer = media.updatedAt > existingTargetMedia.updatedAt;

      if (sourceTrust > targetTrust || (sourceTrust === targetTrust && sourceIsNewer)) {
        await transaction.entityMedia.update({
          data: {
            trustScore: media.trustScore,
            url: media.url
          },
          where: {
            id: existingTargetMedia.id
          }
        });
      }

      await transaction.entityMedia.delete({
        where: {
          id: media.id
        }
      });
    }
  }
}
