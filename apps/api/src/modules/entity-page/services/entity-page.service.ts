import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { EntityClusterService } from "../../entities/services/entity-cluster.service.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { RATINGS_PORT } from "../../ratings/interfaces/ratings.port.js";
import type { RatingsPort } from "../../ratings/interfaces/ratings.port.js";
import { REVIEWS_PORT } from "../../reviews/interfaces/reviews.port.js";
import type { ReviewsPort } from "../../reviews/interfaces/reviews.port.js";
import { ReputationDisplayService } from "../../reputation/services/reputation-display.service.js";
import { EntityPageResponseDto } from "../dto/entity-page-response.dto.js";
import type { EntityPageParentSummaryDto } from "../dto/entity-page-parent-summary.dto.js";
import type { RelatedPresencesResponseDto } from "../dto/related-presence.dto.js";
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
    private readonly entityClusterService: EntityClusterService,
    private readonly reputationDisplayService: ReputationDisplayService
  ) {}

  async getEntityPage(
    entityId: string,
    currentUserId?: string,
    localeInput?: string
  ): Promise<EntityPageResponseDto> {
    const entity = await this.entitiesPort.findEntityById(entityId);

    if (!entity) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    const [rating, trust, reviews, reviewsCount, reviewsCountGlobal, parent, relatedPresences] =
      await Promise.all([
      this.ratingsPort.getAggregate(entityId),
      this.reputationDisplayService.resolveEntityTrustConfidence(entityId),
      this.reviewsPort.listTopReviewsForEntity(
        entityId,
        ENTITY_PAGE_REVIEWS_LIMIT,
        currentUserId,
        localeInput
      ),
      this.reviewsPort.getReviewCountForEntity(entityId, localeInput),
      this.reviewsPort.getReviewCountForEntity(entityId, "all"),
      this.resolveParentSummary(entity.parentId),
      this.resolveRelatedPresences(entityId)
    ]);

    return {
      entity,
      meta: {
        reviewsCount,
        reviewsCountGlobal
      },
      ...(parent ? { parent } : {}),
      relatedPresences,
      rating,
      reviews,
      trust
    };
  }

  async getRelatedPresences(entityId: string): Promise<RelatedPresencesResponseDto> {
    const entity = await this.entitiesPort.findEntityById(entityId);

    if (!entity) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }

    return {
      items: await this.resolveRelatedPresences(entityId)
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

  private async resolveRelatedPresences(entityId: string) {
    const relatedEntities = await this.entityClusterService.listRelatedPresenceEntities(entityId);

    return Promise.all(
      relatedEntities.map(async (relatedEntity) => {
        const aggregate = await this.ratingsPort.getAggregate(relatedEntity.id);

        return {
          canonicalUrl: relatedEntity.canonicalUrl,
          id: relatedEntity.id,
          logoUrl: relatedEntity.logoUrl,
          rating:
            aggregate.votesCount > 0
              ? {
                  avgScore: aggregate.avgScore,
                  votesCount: aggregate.votesCount
                }
              : null,
          slug: relatedEntity.slug,
          title: relatedEntity.title,
          type: relatedEntity.type
        };
      })
    );
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
