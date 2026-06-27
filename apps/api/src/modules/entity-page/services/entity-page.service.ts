import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { RATINGS_PORT } from "../../ratings/interfaces/ratings.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import { REVIEWS_PORT } from "../../reviews/interfaces/reviews.port.js";
import type { ReviewsPort } from "../../reviews/interfaces/reviews.port.js";
import { TRUST_PORT } from "../../trust/interfaces/trust.port.js";
import type { TrustPort } from "../../trust/interfaces/trust.port.js";
import { EntityPageResponseDto } from "../dto/entity-page-response.dto.js";
import type { EntityPageParentSummaryDto } from "../dto/entity-page-parent-summary.dto.js";
import type { EntityDto } from "../../entities/dto/entity.dto.js";

const ENTITY_PAGE_REVIEWS_LIMIT = 10;

@Injectable()
export class EntityPageService {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    @Inject(RATINGS_PORT)
    private readonly ratingsPort: RatingsPort,
    @Inject(REVIEWS_PORT)
    private readonly reviewsPort: ReviewsPort,
    @Inject(TRUST_PORT)
    private readonly trustPort: TrustPort
  ) {}

  async getEntityPage(entityId: string): Promise<EntityPageResponseDto> {
    const entity = await this.entitiesPort.findEntityById(entityId);

    if (!entity) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const [rating, trust, reviews, reviewsCount, parent] = await Promise.all([
      this.ratingsPort.getAggregate(entityId),
      this.trustPort.getEntityTrust(entityId),
      this.reviewsPort.listTopReviewsForEntity(entityId, ENTITY_PAGE_REVIEWS_LIMIT),
      this.reviewsPort.getReviewCountForEntity(entityId),
      this.resolveParentSummary(entity.parentId)
    ]);

    return {
      entity,
      meta: {
        reviewsCount
      },
      ...(parent ? { parent } : {}),
      rating,
      reviews,
      trust
    };
  }

  private async resolveParentSummary(
    parentId: string | null
  ): Promise<EntityPageParentSummaryDto | undefined> {
    if (!parentId) {
      return undefined;
    }

    const parent = await this.entitiesPort.findEntityById(parentId);

    if (!parent) {
      return undefined;
    }

    return toEntityPageParentSummaryDto(parent);
  }
}

function toEntityPageParentSummaryDto(entity: EntityDto): EntityPageParentSummaryDto {
  return {
    canonicalUrl: entity.canonicalUrl,
    id: entity.id,
    slug: entity.slug,
    title: entity.title
  };
}
