import { Injectable } from "@nestjs/common";
import type { ContributionLevel, UserContributionSnapshot } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";

export interface UpsertContributionSnapshotInput {
  battleVotesCount: number;
  contributionScore: number;
  discussionsCount: number;
  entitiesCreatedCount: number;
  fieldFixesCount: number;
  lastActivityAt: Date | null;
  level: ContributionLevel;
  ratingsCount: number;
  reviewsCount: number;
  topsCount: number;
  userId: string;
}

@Injectable()
export class ContributionSnapshotRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findByUserId(userId: string): Promise<UserContributionSnapshot | null> {
    return this.prismaService.userContributionSnapshot.findUnique({
      where: {
        userId
      }
    });
  }

  async upsert(input: UpsertContributionSnapshotInput): Promise<UserContributionSnapshot> {
    return this.prismaService.userContributionSnapshot.upsert({
      create: {
        battleVotesCount: input.battleVotesCount,
        contributionScore: input.contributionScore,
        discussionsCount: input.discussionsCount,
        entitiesCreatedCount: input.entitiesCreatedCount,
        fieldFixesCount: input.fieldFixesCount,
        lastActivityAt: input.lastActivityAt,
        level: input.level,
        ratingsCount: input.ratingsCount,
        reviewsCount: input.reviewsCount,
        topsCount: input.topsCount,
        userId: input.userId
      },
      update: {
        battleVotesCount: input.battleVotesCount,
        contributionScore: input.contributionScore,
        discussionsCount: input.discussionsCount,
        entitiesCreatedCount: input.entitiesCreatedCount,
        fieldFixesCount: input.fieldFixesCount,
        lastActivityAt: input.lastActivityAt,
        level: input.level,
        ratingsCount: input.ratingsCount,
        reviewsCount: input.reviewsCount,
        topsCount: input.topsCount
      },
      where: {
        userId: input.userId
      }
    });
  }
}
