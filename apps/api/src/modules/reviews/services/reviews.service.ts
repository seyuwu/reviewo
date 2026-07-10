import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  inferReviewLocaleFromText,
  normalizeContentLocaleFilter,
  normalizeEntityChatLocale
} from "@reviewo/shared";
import { ReviewVisibility } from "#prisma/client";

import { DomainEventBus } from "../../../common/domain-events/domain-event-bus.js";
import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { ReviewDto } from "../dto/review.dto.js";
import { UpsertReviewDto } from "../dto/upsert-review.dto.js";
import { createReviewCreatedEvent } from "../events/review-created.event.js";
import {
  createReviewHiddenEvent,
  createReviewUnhiddenEvent
} from "../events/review-hidden.event.js";
import { createReviewUpdatedEvent } from "../events/review-updated.event.js";
import type { ReviewsPort } from "../interfaces/reviews.port.js";
import { ReviewsRepository } from "../repositories/reviews.repository.js";
import type { ReviewWithVotes } from "../repositories/reviews.repository.js";

@Injectable()
export class ReviewsService implements ReviewsPort {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    private readonly domainEventBus: DomainEventBus,
    private readonly reviewsRepository: ReviewsRepository
  ) {}

  async upsertMyReview(
    entityId: string,
    input: UpsertReviewDto,
    currentUser: AuthenticatedUser,
    localeInput?: string
  ): Promise<ReviewDto> {
    await this.ensureEntityExists(entityId);

    const locale = resolveReviewLocale(input.locale ?? localeInput, input.text);
    const existingReview = await this.reviewsRepository.findUserReview(
      entityId,
      currentUser.id,
      locale
    );
    const review = await this.reviewsRepository.upsertReview({
      authorId: currentUser.id,
      entityId,
      locale,
      text: input.text.trim()
    });
    const reviewDto = toReviewDto(review, currentUser.id);

    const eventPayload = {
      authorId: currentUser.id,
      entityId,
      reviewId: reviewDto.id
    };

    await this.domainEventBus.publish(
      existingReview
        ? createReviewUpdatedEvent(eventPayload)
        : createReviewCreatedEvent(eventPayload)
    );

    return reviewDto;
  }

  async listReviewsForEntity(
    entityId: string,
    currentUserId?: string,
    localeInput?: string
  ): Promise<ReviewDto[]> {
    await this.ensureEntityExists(entityId);

    const reviews = await this.reviewsRepository.listByEntity(entityId, currentUserId, 50, {
      locale: normalizeContentLocaleFilter(localeInput)
    });

    return reviews.map((review) => toReviewDto(review, currentUserId));
  }

  async listTopReviewsForEntity(
    entityId: string,
    limit: number,
    currentUserId?: string,
    localeInput?: string
  ): Promise<ReviewDto[]> {
    await this.ensureEntityExists(entityId);

    const reviews = await this.reviewsRepository.listByEntity(
      entityId,
      currentUserId,
      limit,
      {
        locale: normalizeContentLocaleFilter(localeInput)
      }
    );

    return reviews.map((review) => toReviewDto(review, currentUserId));
  }

  async getReviewCountForEntity(entityId: string, localeInput?: string): Promise<number> {
    await this.ensureEntityExists(entityId);

    return this.reviewsRepository.countByEntity(entityId, {
      locale: normalizeContentLocaleFilter(localeInput)
    });
  }

  async hideReview(reviewId: string): Promise<ReviewDto> {
    const review = await this.reviewsRepository.findById(reviewId);

    if (!review) {
      throw createReviewNotFoundException();
    }

    if (review.visibility === ReviewVisibility.HIDDEN) {
      return toReviewDto(review);
    }

    const updatedReview = await this.reviewsRepository.updateVisibility(
      reviewId,
      ReviewVisibility.HIDDEN
    );

    await this.domainEventBus.publish(
      createReviewHiddenEvent({
        authorId: updatedReview.authorId,
        entityId: updatedReview.entityId,
        reviewId: updatedReview.id
      })
    );

    return toReviewDto(updatedReview);
  }

  async unhideReview(reviewId: string): Promise<ReviewDto> {
    const review = await this.reviewsRepository.findById(reviewId);

    if (!review) {
      throw createReviewNotFoundException();
    }

    if (review.visibility === ReviewVisibility.ACTIVE) {
      return toReviewDto(review);
    }

    const updatedReview = await this.reviewsRepository.updateVisibility(
      reviewId,
      ReviewVisibility.ACTIVE
    );

    await this.domainEventBus.publish(
      createReviewUnhiddenEvent({
        authorId: updatedReview.authorId,
        entityId: updatedReview.entityId,
        reviewId: updatedReview.id
      })
    );

    return toReviewDto(updatedReview);
  }

  async getMyReview(
    entityId: string,
    currentUser: AuthenticatedUser,
    localeInput?: string
  ): Promise<ReviewDto | null> {
    await this.ensureEntityExists(entityId);

    const locale = normalizeEntityChatLocale(localeInput);
    const review = await this.reviewsRepository.findUserReview(
      entityId,
      currentUser.id,
      locale
    );

    return review ? toReviewDto(review, currentUser.id) : null;
  }

  async likeReview(reviewId: string, currentUser: AuthenticatedUser): Promise<ReviewDto> {
    const review = await this.reviewsRepository.findById(reviewId);

    if (!review || review.visibility === ReviewVisibility.HIDDEN) {
      throw createReviewNotFoundException();
    }

    await this.reviewsRepository.likeReview(reviewId, currentUser.id);

    const updatedReview = await this.reviewsRepository.findById(reviewId, currentUser.id);

    if (!updatedReview) {
      throw createReviewNotFoundException();
    }

    return toReviewDto(updatedReview, currentUser.id);
  }

  async unlikeReview(reviewId: string, currentUser: AuthenticatedUser): Promise<ReviewDto> {
    const review = await this.reviewsRepository.findById(reviewId);

    if (!review || review.visibility === ReviewVisibility.HIDDEN) {
      throw createReviewNotFoundException();
    }

    await this.reviewsRepository.unlikeReview(reviewId, currentUser.id);

    const updatedReview = await this.reviewsRepository.findById(reviewId, currentUser.id);

    if (!updatedReview) {
      throw createReviewNotFoundException();
    }

    return toReviewDto(updatedReview, currentUser.id);
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

function resolveReviewLocale(localeInput: string | undefined, text: string): string {
  if (localeInput === "en" || localeInput === "ru") {
    return localeInput;
  }

  return inferReviewLocaleFromText(text);
}

function toReviewDto(review: ReviewWithVotes, currentUserId?: string): ReviewDto {
  const isOwnReview = currentUserId === review.authorId;

  return {
    createdAt: review.createdAt.toISOString(),
    entityId: review.entityId,
    id: review.id,
    isOwnReview,
    likedByCurrentUser: currentUserId
      ? review.votes.some((vote) => vote.userId === currentUserId)
      : false,
    likesCount: review._count.votes,
    locale: review.locale,
    text: review.text,
    updatedAt: review.updatedAt.toISOString(),
    visibility: review.visibility
  };
}

function createReviewNotFoundException(): Error {
  return createAppException({
    code: AppErrorCode.NotFound,
    message: "Review was not found",
    statusCode: HttpStatus.NOT_FOUND
  });
}
