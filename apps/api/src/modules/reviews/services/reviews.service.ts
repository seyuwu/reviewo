import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { ENTITIES_PORT } from "../../entities/interfaces/entities.port.js";
import type { EntitiesPort } from "../../entities/interfaces/entities.port.js";
import { ReviewDto } from "../dto/review.dto.js";
import { UpsertReviewDto } from "../dto/upsert-review.dto.js";
import type { ReviewsPort } from "../interfaces/reviews.port.js";
import { ReviewsRepository } from "../repositories/reviews.repository.js";
import type { ReviewWithVotes } from "../repositories/reviews.repository.js";

@Injectable()
export class ReviewsService implements ReviewsPort {
  constructor(
    @Inject(ENTITIES_PORT)
    private readonly entitiesPort: EntitiesPort,
    private readonly reviewsRepository: ReviewsRepository
  ) {}

  async upsertMyReview(
    entityId: string,
    input: UpsertReviewDto,
    currentUser: AuthenticatedUser
  ): Promise<ReviewDto> {
    await this.ensureEntityExists(entityId);

    const review = await this.reviewsRepository.upsertReview({
      authorId: currentUser.id,
      entityId,
      text: input.text.trim()
    });

    return toReviewDto(review, currentUser.id);
  }

  async listReviewsForEntity(entityId: string, currentUserId?: string): Promise<ReviewDto[]> {
    await this.ensureEntityExists(entityId);

    const reviews = await this.reviewsRepository.listByEntity(entityId, currentUserId);

    return reviews.map((review) => toReviewDto(review, currentUserId));
  }

  async getReviewCountForEntity(entityId: string): Promise<number> {
    await this.ensureEntityExists(entityId);

    return this.reviewsRepository.countByEntity(entityId);
  }

  async getMyReview(entityId: string, currentUser: AuthenticatedUser): Promise<ReviewDto | null> {
    await this.ensureEntityExists(entityId);

    const review = await this.reviewsRepository.findUserReview(entityId, currentUser.id);

    return review ? toReviewDto(review, currentUser.id) : null;
  }

  async likeReview(reviewId: string, currentUser: AuthenticatedUser): Promise<ReviewDto> {
    const review = await this.reviewsRepository.findById(reviewId);

    if (!review) {
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

    if (!review) {
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

function toReviewDto(review: ReviewWithVotes, currentUserId?: string): ReviewDto {
  return {
    authorId: review.authorId,
    createdAt: review.createdAt.toISOString(),
    entityId: review.entityId,
    id: review.id,
    likedByCurrentUser: currentUserId
      ? review.votes.some((vote) => vote.userId === currentUserId)
      : false,
    likesCount: review._count.votes,
    text: review.text,
    updatedAt: review.updatedAt.toISOString()
  };
}

function createReviewNotFoundException(): Error {
  return createAppException({
    code: AppErrorCode.NotFound,
    message: "Review was not found",
    statusCode: HttpStatus.NOT_FOUND
  });
}
