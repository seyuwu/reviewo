import { Inject, Injectable } from "@nestjs/common";

import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { REVIEWS_PORT } from "../../reviews/interfaces/reviews.port.js";
import type { ReviewsPort } from "../../reviews/interfaces/reviews.port.js";
import { TopCompositionService } from "../../tops/services/top-composition.service.js";
import type { HideEntityResponseDto } from "../dto/hide-content-response.dto.js";
import type { HideReviewResponseDto } from "../dto/hide-content-response.dto.js";

@Injectable()
export class ModerationService {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    @Inject(REVIEWS_PORT)
    private readonly reviewsPort: ReviewsPort,
    private readonly topCompositionService: TopCompositionService
  ) {}

  async hideEntity(entityId: string): Promise<HideEntityResponseDto> {
    const entity = await this.entitiesPort.hideEntity(entityId);

    await this.topCompositionService.syncVisibilityForEntityIds([entityId]);

    return {
      entityId: entity.id,
      hiddenAt: entity.updatedAt,
      visibility: entity.visibility
    };
  }

  async unhideEntity(entityId: string): Promise<HideEntityResponseDto> {
    const entity = await this.entitiesPort.unhideEntity(entityId);

    return {
      entityId: entity.id,
      hiddenAt: entity.updatedAt,
      visibility: entity.visibility
    };
  }

  async hideReview(reviewId: string): Promise<HideReviewResponseDto> {
    const review = await this.reviewsPort.hideReview(reviewId);

    return {
      hiddenAt: review.updatedAt,
      reviewId: review.id,
      visibility: review.visibility
    };
  }

  async unhideReview(reviewId: string): Promise<HideReviewResponseDto> {
    const review = await this.reviewsPort.unhideReview(reviewId);

    return {
      hiddenAt: review.updatedAt,
      reviewId: review.id,
      visibility: review.visibility
    };
  }
}
