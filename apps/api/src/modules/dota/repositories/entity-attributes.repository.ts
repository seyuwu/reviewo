import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import { DOTA_ATTRIBUTE_KEYS, DOTA_PARTY_VERTICAL, DOTA_VERTICAL } from "@reviewo/shared";

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

  async upsertManyWithDotaMatchLock(
    userId: string,
    entityId: string,
    attributes: Record<string, string>,
    options?: {
      activeRecruitingPartySlug?: string;
      expectedPartySlug?: string;
    }
  ): Promise<boolean> {
    return this.prismaService.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`${userId}:dota-party-join`})
        )
      `;

      if (options?.expectedPartySlug) {
        const currentPartySlug = await tx.entityAttribute.findUnique({
          select: { value: true },
          where: {
            entityId_key: {
              entityId,
              key: DOTA_ATTRIBUTE_KEYS.lfgPartySlug
            }
          }
        });
        if (currentPartySlug?.value.trim() !== options.expectedPartySlug) {
          return false;
        }
      }

      if (options?.activeRecruitingPartySlug) {
        const partyMembership = await tx.gamePartyMember.findFirst({
          select: { id: true },
          where: {
            party: {
              expiresAt: { gt: new Date() },
              kind: "PARTY",
              mergedIntoSlug: null,
              slug: options.activeRecruitingPartySlug,
              vertical: DOTA_PARTY_VERTICAL
            },
            role: { in: ["OWNER", "OFFICER"] },
            userId
          }
        });
        if (!partyMembership) {
          return false;
        }
      }

      const lfgUntil = Date.parse(attributes[DOTA_ATTRIBUTE_KEYS.lfgUntil] ?? "");
      const startsSoloSearch =
        Number.isFinite(lfgUntil) &&
        lfgUntil > Date.now() &&
        !attributes[DOTA_ATTRIBUTE_KEYS.lfgPartySlug]?.trim();
      if (startsSoloSearch) {
        const activeParty = await tx.gamePartyMember.findFirst({
          select: { id: true },
          where: {
            party: {
              kind: "PARTY",
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              vertical: DOTA_PARTY_VERTICAL
            },
            userId
          }
        });
        if (activeParty) {
          return false;
        }
      }

      for (const [key, value] of Object.entries(attributes)) {
        await tx.entityAttribute.upsert({
          create: { entityId, key, value },
          update: { value },
          where: { entityId_key: { entityId, key } }
        });
      }

      return true;
    });
  }

  async getDotaSearchConversionStats(): Promise<{
    completedSearches30d: number;
    searchesJoinedParty30d: number;
  }> {
    const startedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [row] = await this.prismaService.$queryRaw<
      Array<{ completed_searches: number; joined_searches: number }>
    >`
      SELECT
        COUNT(*)::int AS completed_searches,
        COUNT(*) FILTER (WHERE status = 'JOINED')::int AS joined_searches
      FROM social.dota_search_sessions
      WHERE search_type = 'SOLO'
        AND started_at >= ${startedAfter}
        AND (
          status IN ('JOINED', 'CANCELLED', 'EXPIRED')
          OR (status = 'SEARCHING' AND expires_at <= NOW())
        )
    `;

    return {
      completedSearches30d: Number(row?.completed_searches ?? 0),
      searchesJoinedParty30d: Number(row?.joined_searches ?? 0)
    };
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

  async countLookingDotaPlayers(): Promise<number> {
    const nowIso = new Date().toISOString();
    const [row] = await this.prismaService.$queryRaw<Array<{ player_count: number }>>`
      SELECT COALESCE(
        SUM(
          CASE
            WHEN COALESCE(recruiting.value, '') = '' THEN 1
            WHEN active_party.id IS NULL THEN 0
            ELSE (
              SELECT COUNT(*)::int
              FROM social.game_party_members AS member
              WHERE member.party_id = active_party.id
            )
          END
        ),
        0
      )::int AS player_count
      FROM entities.entities AS profile
      JOIN entities.entity_attributes AS vertical
        ON vertical.entity_id = profile.id
        AND vertical.key = ${DOTA_ATTRIBUTE_KEYS.vertical}
        AND vertical.value = ${DOTA_VERTICAL}
      JOIN entities.entity_attributes AS lfg
        ON lfg.entity_id = profile.id
        AND lfg.key = ${DOTA_ATTRIBUTE_KEYS.lfgUntil}
        AND lfg.value > ${nowIso}
      LEFT JOIN entities.entity_attributes AS recruiting
        ON recruiting.entity_id = profile.id
        AND recruiting.key = ${DOTA_ATTRIBUTE_KEYS.lfgPartySlug}
      LEFT JOIN social.game_parties AS active_party
        ON active_party.slug = recruiting.value
        AND active_party.vertical = ${DOTA_PARTY_VERTICAL}
        AND active_party.merged_into_slug IS NULL
        AND (active_party.expires_at IS NULL OR active_party.expires_at > NOW())
      WHERE profile.type = 'person'
        AND profile.visibility = 'ACTIVE'
        AND profile.owner_user_id IS NOT NULL
    `;

    return Number(row?.player_count ?? 0);
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
