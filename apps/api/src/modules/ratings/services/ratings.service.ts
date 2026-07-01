import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Rating, RatingAggregate } from "#prisma/client";

import { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { RateEntityDto } from "../dto/rate-entity.dto.js";
import { RatingAggregateDto } from "../dto/rating-aggregate.dto.js";
import { RateEntityResponseDto, UserRatingDto } from "../dto/rating-response.dto.js";
import { createRatingCreatedEvent } from "../events/rating-created.event.js";
import { createRatingUpdatedEvent } from "../events/rating-updated.event.js";
import type { RatingsPort } from "../interfaces/ratings.port.js";
import { RatingsRepository } from "../repositories/ratings.repository.js";

const DEFAULT_RATING_SOURCE = "web";

@Injectable()
export class RatingsService implements RatingsPort {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    private readonly domainEventBus: DomainEventBus,
    private readonly ratingsRepository: RatingsRepository
  ) {}

  async rateEntity(
    entityId: string,
    input: RateEntityDto,
    currentUser: AuthenticatedUser
  ): Promise<RateEntityResponseDto> {
    await this.ensureEntityExists(entityId);

    const result = await this.ratingsRepository.runInTransaction(async (transaction) => {
      const existingRating = await this.ratingsRepository.findUserRating(
        entityId,
        currentUser.id,
        transaction
      );
      const rating = await this.ratingsRepository.upsertRating(
        {
          entityId,
          score: input.score,
          source: DEFAULT_RATING_SOURCE,
          userId: currentUser.id
        },
        transaction
      );
      const aggregate = await this.ratingsRepository.recalculateAggregate(entityId, transaction);

      return {
        aggregate: toAggregateDto(aggregate),
        ratingId: rating.id,
        rating: toUserRatingDto(rating),
        wasCreated: !existingRating
      };
    });

    const eventPayload = {
      entityId,
      ratingId: result.ratingId,
      score: result.rating.score,
      userId: currentUser.id
    };

    await this.domainEventBus.publish(
      result.wasCreated
        ? createRatingCreatedEvent(eventPayload)
        : createRatingUpdatedEvent(eventPayload)
    );

    return {
      aggregate: result.aggregate,
      rating: result.rating
    };
  }

  async getAggregate(entityId: string): Promise<RatingAggregateDto> {
    await this.ensureEntityExists(entityId);

    const aggregate = await this.ratingsRepository.getAggregate(entityId);

    return aggregate ? toAggregateDto(aggregate) : createEmptyAggregateDto(entityId);
  }

  async getMyRating(
    entityId: string,
    currentUser: AuthenticatedUser
  ): Promise<UserRatingDto | null> {
    await this.ensureEntityExists(entityId);

    const rating = await this.ratingsRepository.findUserRating(entityId, currentUser.id);

    return rating ? toUserRatingDto(rating) : null;
  }

  private async ensureEntityExists(entityId: string): Promise<void> {
    const entity = await this.entitiesPort.findEntityById(entityId);

    if (!entity) {
      throw createAppException({
        code: AppErrorCode.NotFound,
        message: "Entity was not found",
        statusCode: HttpStatus.NOT_FOUND
      });
    }
  }
}

function toUserRatingDto(rating: Rating): UserRatingDto {
  return {
    createdAt: rating.createdAt.toISOString(),
    entityId: rating.entityId,
    score: rating.score,
    source: rating.source,
    updatedAt: rating.updatedAt.toISOString(),
    userId: rating.userId
  };
}

function toAggregateDto(aggregate: RatingAggregate): RatingAggregateDto {
  return {
    avgScore: Number(aggregate.avgScore),
    distribution: {
      "1": aggregate.distribution1,
      "2": aggregate.distribution2,
      "3": aggregate.distribution3,
      "4": aggregate.distribution4,
      "5": aggregate.distribution5
    },
    entityId: aggregate.entityId,
    updatedAt: aggregate.updatedAt.toISOString(),
    votesCount: aggregate.votesCount
  };
}

function createEmptyAggregateDto(entityId: string): RatingAggregateDto {
  return {
    avgScore: 0,
    distribution: {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0
    },
    entityId,
    updatedAt: new Date(0).toISOString(),
    votesCount: 0
  };
}
