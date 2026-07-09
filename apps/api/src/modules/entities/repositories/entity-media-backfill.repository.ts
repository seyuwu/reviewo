import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import { ENTITY_MEDIA_BACKFILL_BATCH_SIZE } from "../constants/entity-media.js";

@Injectable()
export class EntityMediaBackfillRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async listEntitiesForLogoEnrichment(
    cursor: string | null,
    batchSize: number = ENTITY_MEDIA_BACKFILL_BATCH_SIZE
  ): Promise<Array<{ canonicalUrl: string; id: string }>> {
    return this.prismaService.entity.findMany({
      orderBy: {
        id: "asc"
      },
      select: {
        canonicalUrl: true,
        id: true
      },
      take: batchSize,
      where: {
        canonicalUrl: {
          not: null
        },
        ...(cursor
          ? {
              id: {
                gt: cursor
              }
            }
          : {}),
        OR: [
          {
            logoUrl: null
          },
          {
            media: {
              none: {
                type: "LOGO",
                source: {
                  in: ["FAVICON", "OG_IMAGE"]
                }
              }
            }
          }
        ]
      }
    }) as Promise<Array<{ canonicalUrl: string; id: string }>>;
  }
}
