import { Injectable } from "@nestjs/common";
import type { SpotlightPlacement, SpotlightPlacementType } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface CreateSpotlightPlacementInput {
  cost: number;
  endsAt: Date;
  entityId?: string | null;
  pairKey?: string | null;
  pairSlug?: string | null;
  placementType: SpotlightPlacementType;
  recommendationId: string;
  startsAt?: Date;
  topId?: string | null;
  userId: string;
}

export interface SpotlightPlacementRow extends SpotlightPlacement {
  sponsorDisplayName: string;
}

@Injectable()
export class SpotlightPlacementsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(input: CreateSpotlightPlacementInput): Promise<SpotlightPlacement> {
    return this.prismaService.spotlightPlacement.create({
      data: {
        cost: input.cost,
        endsAt: input.endsAt,
        entityId: input.entityId ?? null,
        pairKey: input.pairKey ?? null,
        pairSlug: input.pairSlug ?? null,
        placementType: input.placementType,
        recommendationId: input.recommendationId,
        startsAt: input.startsAt ?? new Date(),
        topId: input.topId ?? null,
        userId: input.userId
      }
    });
  }

  async listActive(limit = 50): Promise<SpotlightPlacementRow[]> {
    const now = new Date();
    const safeLimit = Math.max(1, Math.min(limit, 100));

    const placements = await this.prismaService.spotlightPlacement.findMany({
      orderBy: { startsAt: "desc" },
      take: safeLimit,
      where: {
        endsAt: { gt: now },
        startsAt: { lte: now }
      }
    });

    return this.attachSponsorDisplayNames(placements);
  }

  async countActiveByUserAndType(
    userId: string,
    placementType: SpotlightPlacementType
  ): Promise<number> {
    const now = new Date();

    return this.prismaService.spotlightPlacement.count({
      where: {
        endsAt: { gt: now },
        placementType,
        startsAt: { lte: now },
        userId
      }
    });
  }

  async findActiveById(placementId: string): Promise<SpotlightPlacementRow | null> {
    const now = new Date();

    const placement = await this.prismaService.spotlightPlacement.findFirst({
      where: {
        endsAt: { gt: now },
        id: placementId,
        startsAt: { lte: now }
      }
    });

    if (!placement) {
      return null;
    }

    const [row] = await this.attachSponsorDisplayNames([placement]);
    return row ?? null;
  }

  private async attachSponsorDisplayNames(
    placements: SpotlightPlacement[]
  ): Promise<SpotlightPlacementRow[]> {
    if (placements.length === 0) {
      return [];
    }

    const users = await this.prismaService.user.findMany({
      select: { displayName: true, id: true },
      where: {
        id: {
          in: [...new Set(placements.map((placement) => placement.userId))]
        }
      }
    });
    const displayNameByUserId = new Map(users.map((user) => [user.id, user.displayName]));

    return placements.map((placement) => ({
      ...placement,
      sponsorDisplayName: displayNameByUserId.get(placement.userId) ?? "Participant"
    }));
  }
}
