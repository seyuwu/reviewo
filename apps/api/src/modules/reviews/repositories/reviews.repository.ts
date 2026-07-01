import { Injectable } from "@nestjs/common";
import type { Prisma, Review, ReviewVisibility, ReviewVote } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface UpsertReviewInput {
  authorId: string;
  entityId: string;
  text: string;
}

export type ReviewWithVotes = Review & {
  votes: ReviewVote[];
  _count: {
    votes: number;
  };
};

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

  async findUserReview(entityId: string, authorId: string): Promise<ReviewWithVotes | null> {
    return this.prismaService.review.findUnique({
      include: getReviewInclude(authorId),
      where: {
        authorId_entityId: {
          authorId,
          entityId
        }
      }
    });
  }

  async listByEntity(
    entityId: string,
    currentUserId?: string,
    limit = 50
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
      where: {
        entityId,
        visibility: "ACTIVE"
      }
    });
  }

  async countByEntity(entityId: string): Promise<number> {
    return this.prismaService.review.count({
      where: {
        entityId,
        visibility: "ACTIVE"
      }
    });
  }

  async upsertReview(input: UpsertReviewInput): Promise<ReviewWithVotes> {
    return this.prismaService.review.upsert({
      create: {
        authorId: input.authorId,
        entityId: input.entityId,
        text: input.text
      },
      include: getReviewInclude(input.authorId),
      update: {
        text: input.text
      },
      where: {
        authorId_entityId: {
          authorId: input.authorId,
          entityId: input.entityId
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
