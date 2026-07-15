import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import { DOTA_ATTRIBUTE_KEYS, DOTA_VERTICAL } from "@reviewo/shared";

@Injectable()
export class EntityAttributesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async upsertMany(entityId: string, attributes: Record<string, string>): Promise<void> {
    const entries = Object.entries(attributes);

    if (entries.length === 0) {
      return;
    }

    await this.prismaService.$transaction(
      entries.map(([key, value]) =>
        this.prismaService.entityAttribute.upsert({
          create: {
            entityId,
            key,
            value
          },
          update: {
            value
          },
          where: {
            entityId_key: {
              entityId,
              key
            }
          }
        })
      )
    );
  }

  async findByEntityId(entityId: string): Promise<Record<string, string>> {
    const rows = await this.prismaService.entityAttribute.findMany({
      where: {
        entityId
      }
    });

    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }

  async findEntityIdByDotaAccountId(accountId: string): Promise<string | null> {
    const row = await this.prismaService.entityAttribute.findFirst({
      select: {
        entityId: true
      },
      where: {
        key: DOTA_ATTRIBUTE_KEYS.dotaAccountId,
        value: accountId
      }
    });

    return row?.entityId ?? null;
  }

  async searchDotaProfiles(
    query: string,
    ownerUserIds: string[],
    limit = 8
  ): Promise<
    Array<{
      attributes: Array<{ key: string; value: string }>;
      id: string;
      ownerUserId: string | null;
      slug: string;
      title: string;
    }>
  > {
    const normalized = query.trim();

    if (!normalized) {
      return [];
    }

    const slugPattern = normalized.toLowerCase().replace(/\s+/g, "-");

    return this.prismaService.entity.findMany({
      include: {
        attributes: {
          select: {
            key: true,
            value: true
          },
          where: {
            key: {
              in: [
                DOTA_ATTRIBUTE_KEYS.dotaAccountId,
                DOTA_ATTRIBUTE_KEYS.mmr,
                DOTA_ATTRIBUTE_KEYS.vertical
              ]
            }
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: limit,
      where: {
        attributes: {
          some: {
            key: DOTA_ATTRIBUTE_KEYS.vertical,
            value: DOTA_VERTICAL
          }
        },
        OR: [
          {
            title: {
              contains: normalized,
              mode: "insensitive"
            }
          },
          {
            slug: {
              contains: slugPattern,
              mode: "insensitive"
            }
          },
          {
            attributes: {
              some: {
                key: DOTA_ATTRIBUTE_KEYS.dotaAccountId,
                value: {
                  contains: normalized
                }
              }
            }
          },
          ...(ownerUserIds.length > 0
            ? [
                {
                  ownerUserId: {
                    in: ownerUserIds
                  }
                }
              ]
            : [])
        ],
        type: "person",
        visibility: "ACTIVE"
      }
    });
  }

  async listLookingDotaProfiles(limit = 20): Promise<
    Array<{
      attributes: Array<{ key: string; value: string }>;
      id: string;
      ownerUserId: string | null;
      slug: string;
      title: string;
      updatedAt: Date;
    }>
  > {
    const nowIso = new Date().toISOString();

    return this.prismaService.entity.findMany({
      include: {
        attributes: {
          select: {
            key: true,
            value: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      },
      take: Math.min(Math.max(limit, 1), 40),
      where: {
        AND: [
          {
            attributes: {
              some: {
                key: DOTA_ATTRIBUTE_KEYS.vertical,
                value: DOTA_VERTICAL
              }
            }
          },
          {
            attributes: {
              some: {
                key: DOTA_ATTRIBUTE_KEYS.lfgUntil,
                value: {
                  gt: nowIso
                }
              }
            }
          }
        ],
        type: "person",
        visibility: "ACTIVE"
      }
    });
  }

  isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}
