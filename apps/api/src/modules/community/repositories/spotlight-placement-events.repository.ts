import { Injectable } from "@nestjs/common";
import type { SpotlightPlacementEventType } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface RecordSpotlightPlacementEventInput {
  eventType: SpotlightPlacementEventType;
  placementId: string;
  userId?: string | null;
  viewerKey: string;
}

@Injectable()
export class SpotlightPlacementEventsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async record(input: RecordSpotlightPlacementEventInput): Promise<{ recorded: boolean }> {
    try {
      await this.prismaService.spotlightPlacementEvent.create({
        data: {
          eventType: input.eventType,
          placementId: input.placementId,
          userId: input.userId ?? null,
          viewerKey: input.viewerKey
        }
      });

      return { recorded: true };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return { recorded: false };
      }

      throw error;
    }
  }

  async findActivePlacement(placementId: string) {
    const now = new Date();

    return this.prismaService.spotlightPlacement.findFirst({
      select: {
        endsAt: true,
        id: true,
        startsAt: true
      },
      where: {
        endsAt: { gt: now },
        id: placementId,
        startsAt: { lte: now }
      }
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }
}
