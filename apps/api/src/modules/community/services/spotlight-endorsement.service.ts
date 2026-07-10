import { HttpStatus, Injectable } from "@nestjs/common";
import type { SpotlightPlacement } from "#prisma/client";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { RecommendationEndorsementsRepository } from "../../recommendation/repositories/recommendation-endorsements.repository.js";
import type { SpotlightEndorseResponseDto } from "../dto/spotlight.dto.js";
import { SpotlightPlacementsRepository } from "../repositories/spotlight-placements.repository.js";

@Injectable()
export class SpotlightEndorsementService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly recommendationEndorsementsRepository: RecommendationEndorsementsRepository,
    private readonly spotlightPlacementsRepository: SpotlightPlacementsRepository
  ) {}

  async endorse(placementId: string, userId: string): Promise<SpotlightEndorseResponseDto> {
    const placement = await this.requireActivePlacement(placementId);

    if (placement.userId === userId) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "You cannot endorse your own recommendation",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const canEndorse = await this.userCanEndorse(userId, placement);

    if (!canEndorse) {
      throw createAppException({
        code: AppErrorCode.Forbidden,
        message: "Rate or review the target before endorsing this recommendation",
        statusCode: HttpStatus.FORBIDDEN
      });
    }

    const recommendationId = placement.recommendationId;
    const alreadyEndorsed = await this.recommendationEndorsementsRepository.hasEndorsement(
      recommendationId,
      userId
    );

    if (alreadyEndorsed) {
      const endorsementsCount =
        await this.recommendationEndorsementsRepository.countByRecommendationIds([recommendationId]);

      return {
        endorsementsCount: endorsementsCount.get(recommendationId) ?? 0,
        viewerHasEndorsed: true
      };
    }

    const endorsementsCount = await this.recommendationEndorsementsRepository.create(
      recommendationId,
      userId
    );

    return {
      endorsementsCount,
      viewerHasEndorsed: true
    };
  }

  async unendorse(placementId: string, userId: string): Promise<SpotlightEndorseResponseDto> {
    const placement = await this.requireActivePlacement(placementId);
    const endorsementsCount = await this.recommendationEndorsementsRepository.remove(
      placement.recommendationId,
      userId
    );

    return {
      endorsementsCount,
      viewerHasEndorsed: false
    };
  }

  private async requireActivePlacement(placementId: string): Promise<SpotlightPlacement> {
    const placement = await this.spotlightPlacementsRepository.findActiveById(placementId);

    if (!placement) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Spotlight placement not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return placement;
  }

  private async userCanEndorse(userId: string, placement: SpotlightPlacement): Promise<boolean> {
    if (placement.placementType === "entity_spotlight" && placement.entityId) {
      return this.userHasEntityPresence(userId, placement.entityId);
    }

    if (placement.placementType === "battle_boost" && placement.pairKey) {
      const battleVote = await this.prismaService.battleVote.findFirst({
        select: { id: true },
        where: {
          pairKey: placement.pairKey,
          userId
        }
      });

      if (battleVote) {
        return true;
      }

      if (!placement.pairSlug) {
        return false;
      }

      const parsed = placement.pairSlug.match(/^(.+)-vs-(.+)$/);

      if (!parsed?.[1] || !parsed[2]) {
        return false;
      }

      const entities = await this.prismaService.entity.findMany({
        select: { id: true },
        where: {
          slug: { in: [parsed[1], parsed[2]] },
          visibility: "ACTIVE"
        }
      });

      for (const entity of entities) {
        if (await this.userHasEntityPresence(userId, entity.id)) {
          return true;
        }
      }

      return false;
    }

    if (placement.placementType === "top_highlight" && placement.topId) {
      const [topLike, topItem] = await Promise.all([
        this.prismaService.topLike.findFirst({
          select: { id: true },
          where: {
            topId: placement.topId,
            userId
          }
        }),
        this.prismaService.topItem.findFirst({
          select: { entityId: true },
          where: { topId: placement.topId }
        })
      ]);

      if (topLike) {
        return true;
      }

      if (topItem?.entityId) {
        return this.userHasEntityPresence(userId, topItem.entityId);
      }

      return false;
    }

    return false;
  }

  private async userHasEntityPresence(userId: string, entityId: string): Promise<boolean> {
    const [rating, review] = await Promise.all([
      this.prismaService.rating.findUnique({
        select: { id: true },
        where: {
          entityId_userId: {
            entityId,
            userId
          }
        }
      }),
      this.prismaService.review.findFirst({
        select: { id: true },
        where: {
          authorId: userId,
          entityId,
          visibility: "ACTIVE"
        }
      })
    ]);

    return Boolean(rating || review);
  }
}
