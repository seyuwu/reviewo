import { Injectable } from "@nestjs/common";
import type { CommunityRecommendation, SpotlightPlacementType } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface CreateCommunityRecommendationInput {
  authorId: string;
  entityId?: string | null;
  message?: string | null;
  pairKey?: string | null;
  pairSlug?: string | null;
  placementType: SpotlightPlacementType;
  reviewId?: string | null;
  topId?: string | null;
}

@Injectable()
export class RecommendationsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async create(input: CreateCommunityRecommendationInput): Promise<CommunityRecommendation> {
    return this.prismaService.communityRecommendation.create({
      data: {
        authorId: input.authorId,
        entityId: input.entityId ?? null,
        message: input.message ?? null,
        pairKey: input.pairKey ?? null,
        pairSlug: input.pairSlug ?? null,
        placementType: input.placementType,
        reviewId: input.reviewId ?? null,
        topId: input.topId ?? null
      }
    });
  }
}
