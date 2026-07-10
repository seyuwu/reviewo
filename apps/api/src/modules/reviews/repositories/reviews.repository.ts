import { Injectable } from "@nestjs/common";
import type { Prisma, Review, ReviewVisibility, ReviewVote } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import {
  buildReviewWhere,
  type ReviewListFilter
} from "../lib/review-locale-filter.js";

export interface UpsertReviewInput {
  authorId: string;
  entityId: string;
  locale: string;
  text: string;
}

export type ReviewWithVotes = Review & {
  votes: ReviewVote[];
  _count: {
    votes: number;
  };
};

export type { ReviewListFilter };

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findById(id: string, currentUserId?: string): Promise<ReviewWithVotes | null> {
    return this.prismaService.review.findUnique({
      include: getReviewInclude(currentUserId),
      where: {
        id
      }
    });
  }

  async findUserReview(
    entityId: string,
    authorId: string,
    locale: string
  ): Promise<ReviewWithVotes | null> {
    return this.prismaService.review.findUnique({
      include: getReviewInclude(authorId),
      where: {
        authorId_entityId_locale: {
          authorId,
          entityId,
          locale
        }
      }
    });
  }

  async listByEntity(
    entityId: string,
    currentUserId?: string,
    limit = 50,
    filter: ReviewListFilter = {}
  ): Promise<ReviewWithVotes[]> {
    return this.prismaService.review.findMany({
      include: getReviewInclude(currentUserId),
      orderBy: [
        {
          votes: {
            _count: "desc"
          }
        },
        {
          updatedAt: "desc"
        }
      ],
      take: limit,
      where: buildReviewWhere(entityId, filter)
    });
  }

  async countByEntity(entityId: string, filter: ReviewListFilter = {}): Promise<number> {
    return this.prismaService.review.count({
      where: buildReviewWhere(entityId, filter)
    });
  }

  async upsertReview(input: UpsertReviewInput): Promise<ReviewWithVotes> {
    return this.prismaService.review.upsert({
      create: {
        authorId: input.authorId,
        entityId: input.entityId,
        locale: input.locale,
        text: input.text
      },
      include: getReviewInclude(input.authorId),
      update: {
        text: input.text
      },
      where: {
        authorId_entityId_locale: {
          authorId: input.authorId,
          entityId: input.entityId,
          locale: input.locale
        }
      }
    });
  }

  async likeReview(reviewId: string, userId: string): Promise<void> {
    await this.prismaService.reviewVote.upsert({
      create: {
        reviewId,
        userId
      },
      update: {},
      where: {
        reviewId_userId: {
          reviewId,
          userId
        }
      }
    });
  }

  async unlikeReview(reviewId: string, userId: string): Promise<void> {
    await this.prismaService.reviewVote.deleteMany({
      where: {
        reviewId,
        userId
      }
    });
  }

  async updateVisibility(id: string, visibility: ReviewVisibility): Promise<ReviewWithVotes> {
    return this.prismaService.review.update({
      data: {
        visibility
      },
      include: getReviewInclude(),
      where: {
        id
      }
    });
  }
}

function getReviewInclude(currentUserId?: string): Prisma.ReviewInclude {
  return {
    _count: {
      select: {
        votes: true
      }
    },
    votes: currentUserId
      ? {
          where: {
            userId: currentUserId
          }
        }
      : {
          take: 0
        }
  };
}
