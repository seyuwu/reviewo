import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  EntityAnomalyMetrics,
  EntityConfidenceProfile,
  ReputationEvent,
  UserBehaviorMetrics,
  UserTrustProfile,
  VoteWeightSnapshot
} from "@prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import { REPUTATION_ROOT_CONTEXT_TYPE } from "../constants/calculation-versions.js";
import { toUtcDateOnly, truncateToUtcHour } from "../utils/date-buckets.js";

export interface AppendReputationEventInput {
  entityId?: string;
  payload: Prisma.InputJsonValue;
  ratingId?: string;
  type: string;
  userId?: string;
}

export interface UpsertUserTrustProfileInput {
  accountAgeBonus: number;
  anomalyPenalty: number;
  calculationVersion: number;
  consensusScore: number;
  coverageScore: number;
  diversityScore: number;
  stabilityScore: number;
  trustScore: number;
  userId: string;
}

export interface UpsertVoteWeightSnapshotInput {
  calculationVersion: number;
  entityId: string;
  ratingId: string;
  score: number;
  userId: string;
  voteWeight: number;
  weightFactors: Prisma.InputJsonValue;
}

export interface UpsertEntityConfidenceProfileInput {
  activityDurationDays: number;
  anomalyScore: number;
  calculationVersion: number;
  confidenceScore: number;
  effectiveVoteMass: number;
  entityId: string;
  explanation: Prisma.InputJsonValue;
  scoreVariance: number | null;
  uniqueRatersCount: number;
}

export interface UpsertEntityAnomalyMetricsInput {
  anomalyScore: number;
  burstScore: number;
  clusterScore: number;
  entityId: string;
  recentBurstCount: number;
  syncScore: number;
}

export interface UserHourlyActivityCounts {
  ratingCreatedCount: number;
  ratingUpdatedCount: number;
}

@Injectable()
export class ReputationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async appendReputationEvent(input: AppendReputationEventInput): Promise<ReputationEvent> {
    return this.prismaService.reputationEvent.create({
      data: {
        entityId: input.entityId ?? null,
        payload: input.payload,
        ratingId: input.ratingId ?? null,
        type: input.type,
        userId: input.userId ?? null
      }
    });
  }

  async incrementUserActivityDaily(
    userId: string,
    activityDate: Date,
    incrementBy = 1
  ): Promise<void> {
    const normalizedDate = toUtcDateOnly(activityDate);

    await this.prismaService.userActivityDaily.upsert({
      create: {
        activityDate: normalizedDate,
        ratingCount: incrementBy,
        userId
      },
      update: {
        ratingCount: {
          increment: incrementBy
        }
      },
      where: {
        userId_activityDate: {
          activityDate: normalizedDate,
          userId
        }
      }
    });
  }

  async incrementUserActivityHourly(input: {
    activityAt: Date;
    createdIncrement?: number;
    updatedIncrement?: number;
    userId: string;
  }): Promise<void> {
    const activityHour = truncateToUtcHour(input.activityAt);
    const createdIncrement = input.createdIncrement ?? 0;
    const updatedIncrement = input.updatedIncrement ?? 0;

    await this.prismaService.userActivityHourly.upsert({
      create: {
        activityHour,
        ratingCreatedCount: createdIncrement,
        ratingUpdatedCount: updatedIncrement,
        userId: input.userId
      },
      update: {
        ratingCreatedCount: {
          increment: createdIncrement
        },
        ratingUpdatedCount: {
          increment: updatedIncrement
        }
      },
      where: {
        userId_activityHour: {
          activityHour,
          userId: input.userId
        }
      }
    });
  }

  async incrementUserEntityStats(
    userId: string,
    entityId: string,
    ratedAt: Date,
    incrementBy = 1
  ): Promise<{ isNewEntity: boolean }> {
    const existing = await this.prismaService.userEntityStats.findUnique({
      where: {
        userId_entityId: {
          entityId,
          userId
        }
      }
    });

    await this.prismaService.userEntityStats.upsert({
      create: {
        entityId,
        lastRatedAt: ratedAt,
        ratingCount: incrementBy,
        userId
      },
      update: {
        lastRatedAt: ratedAt,
        ratingCount: {
          increment: incrementBy
        }
      },
      where: {
        userId_entityId: {
          entityId,
          userId
        }
      }
    });

    return {
      isNewEntity: !existing
    };
  }

  async incrementUserEntityTypeStats(
    userId: string,
    entityType: string,
    parentContextType: string,
    incrementBy = 1
  ): Promise<{ isNewPair: boolean }> {
    const existing = await this.prismaService.userEntityTypeStats.findUnique({
      where: {
        userId_entityType_parentContextType: {
          entityType,
          parentContextType,
          userId
        }
      }
    });

    await this.prismaService.userEntityTypeStats.upsert({
      create: {
        entityType,
        parentContextType,
        ratingCount: incrementBy,
        userId
      },
      update: {
        ratingCount: {
          increment: incrementBy
        }
      },
      where: {
        userId_entityType_parentContextType: {
          entityType,
          parentContextType,
          userId
        }
      }
    });

    return {
      isNewPair: !existing
    };
  }

  async incrementUserRootDomainStats(
    userId: string,
    rootDomain: string,
    incrementBy = 1
  ): Promise<{ isNewDomain: boolean }> {
    const existing = await this.prismaService.userRootDomainStats.findUnique({
      where: {
        userId_rootDomain: {
          rootDomain,
          userId
        }
      }
    });

    await this.prismaService.userRootDomainStats.upsert({
      create: {
        ratingCount: incrementBy,
        rootDomain,
        userId
      },
      update: {
        ratingCount: {
          increment: incrementBy
        }
      },
      where: {
        userId_rootDomain: {
          rootDomain,
          userId
        }
      }
    });

    return {
      isNewDomain: !existing
    };
  }

  async applyRatingToUserBehaviorMetrics(input: {
    isNewEntity: boolean;
    isNewDomain: boolean;
    isNewTypePair: boolean;
    ratedAt: Date;
    score: number;
    userId: string;
  }): Promise<UserBehaviorMetrics> {
    const scoreField = getScoreCountField(input.score);

    return this.prismaService.userBehaviorMetrics.upsert({
      create: {
        [scoreField]: 1,
        firstRatingAt: input.ratedAt,
        lastRatingAt: input.ratedAt,
        totalRatings: 1,
        uniqueEntityCount: input.isNewEntity ? 1 : 0,
        uniqueEntityTypeCount: input.isNewTypePair ? 1 : 0,
        uniqueRootDomainCount: input.isNewDomain ? 1 : 0,
        userId: input.userId
      },
      update: {
        [scoreField]: {
          increment: 1
        },
        lastRatingAt: input.ratedAt,
        totalRatings: {
          increment: 1
        },
        ...(input.isNewEntity
          ? {
              uniqueEntityCount: {
                increment: 1
              }
            }
          : {}),
        ...(input.isNewTypePair
          ? {
              uniqueEntityTypeCount: {
                increment: 1
              }
            }
          : {}),
        ...(input.isNewDomain
          ? {
              uniqueRootDomainCount: {
                increment: 1
              }
            }
          : {})
      },
      where: {
        userId: input.userId
      }
    });
  }

  async updateRatingScoreInBehaviorMetrics(
    userId: string,
    previousScore: number,
    nextScore: number
  ): Promise<void> {
    const previousField = getScoreCountField(previousScore);
    const nextField = getScoreCountField(nextScore);

    if (previousField === nextField) {
      return;
    }

    await this.prismaService.userBehaviorMetrics.update({
      data: {
        [previousField]: {
          decrement: 1
        },
        [nextField]: {
          increment: 1
        }
      },
      where: {
        userId
      }
    });
  }

  async getUserBehaviorMetrics(userId: string): Promise<UserBehaviorMetrics | null> {
    return this.prismaService.userBehaviorMetrics.findUnique({
      where: {
        userId
      }
    });
  }

  async listUserActivityDaily(userId: string, since: Date): Promise<number[]> {
    const rows = await this.prismaService.userActivityDaily.findMany({
      orderBy: {
        activityDate: "asc"
      },
      where: {
        activityDate: {
          gte: toUtcDateOnly(since)
        },
        userId
      }
    });

    return rows.map((row) => row.ratingCount);
  }

  async listUserActivityHourly(
    userId: string,
    since: Date
  ): Promise<UserHourlyActivityCounts[]> {
    const rows = await this.prismaService.userActivityHourly.findMany({
      orderBy: {
        activityHour: "asc"
      },
      select: {
        ratingCreatedCount: true,
        ratingUpdatedCount: true
      },
      where: {
        activityHour: {
          gte: truncateToUtcHour(since)
        },
        userId
      }
    });

    return rows;
  }

  async listTopUserEntityRatingCounts(userId: string, limit = 50): Promise<number[]> {
    const rows = await this.prismaService.userEntityStats.findMany({
      orderBy: {
        ratingCount: "desc"
      },
      select: {
        ratingCount: true
      },
      take: limit,
      where: {
        userId
      }
    });

    return rows.map((row) => row.ratingCount);
  }

  async countUserEntityTypePairs(userId: string): Promise<number> {
    return this.prismaService.userEntityTypeStats.count({
      where: {
        userId
      }
    });
  }

  async incrementEntityActivityHourly(
    entityId: string,
    activityAt: Date,
    incrementBy = 1
  ): Promise<number> {
    const activityHour = truncateToUtcHour(activityAt);
    const row = await this.prismaService.entityActivityHourly.upsert({
      create: {
        activityHour,
        entityId,
        ratingCount: incrementBy
      },
      update: {
        ratingCount: {
          increment: incrementBy
        }
      },
      where: {
        entityId_activityHour: {
          activityHour,
          entityId
        }
      }
    });

    return row.ratingCount;
  }

  async getEntityActivityHourlyCount(entityId: string, activityAt: Date): Promise<number> {
    const activityHour = truncateToUtcHour(activityAt);
    const row = await this.prismaService.entityActivityHourly.findUnique({
      select: {
        ratingCount: true
      },
      where: {
        entityId_activityHour: {
          activityHour,
          entityId
        }
      }
    });

    return row?.ratingCount ?? 0;
  }

  async upsertUserTrustProfile(input: UpsertUserTrustProfileInput): Promise<UserTrustProfile> {
    const calculatedAt = new Date();

    return this.prismaService.userTrustProfile.upsert({
      create: {
        ...input,
        calculatedAt
      },
      update: {
        ...input,
        calculatedAt
      },
      where: {
        userId: input.userId
      }
    });
  }

  async upsertVoteWeightSnapshot(input: UpsertVoteWeightSnapshotInput): Promise<VoteWeightSnapshot> {
    return this.prismaService.voteWeightSnapshot.upsert({
      create: input,
      update: {
        calculationVersion: input.calculationVersion,
        score: input.score,
        voteWeight: input.voteWeight,
        weightFactors: input.weightFactors
      },
      where: {
        ratingId: input.ratingId
      }
    });
  }

  async sumVoteWeightsForEntity(entityId: string): Promise<number> {
    const aggregate = await this.prismaService.voteWeightSnapshot.aggregate({
      _sum: {
        voteWeight: true
      },
      where: {
        entityId
      }
    });

    return Number(aggregate._sum.voteWeight ?? 0);
  }

  async upsertEntityAnomalyMetrics(
    input: UpsertEntityAnomalyMetricsInput
  ): Promise<EntityAnomalyMetrics> {
    const lastAnomalyAt = input.anomalyScore > 0.2 ? new Date() : undefined;

    return this.prismaService.entityAnomalyMetrics.upsert({
      create: {
        ...input,
        ...(lastAnomalyAt ? { lastAnomalyAt } : {})
      },
      update: {
        ...input,
        ...(lastAnomalyAt ? { lastAnomalyAt } : {})
      },
      where: {
        entityId: input.entityId
      }
    });
  }

  async upsertEntityConfidenceProfile(
    input: UpsertEntityConfidenceProfileInput
  ): Promise<EntityConfidenceProfile> {
    const calculatedAt = new Date();

    return this.prismaService.entityConfidenceProfile.upsert({
      create: {
        ...input,
        calculatedAt
      },
      update: {
        ...input,
        calculatedAt
      },
      where: {
        entityId: input.entityId
      }
    });
  }

  async getUserTrustProfile(userId: string): Promise<UserTrustProfile | null> {
    return this.prismaService.userTrustProfile.findUnique({
      where: {
        userId
      }
    });
  }

  async getEntityConfidenceProfile(entityId: string): Promise<EntityConfidenceProfile | null> {
    return this.prismaService.entityConfidenceProfile.findUnique({
      where: {
        entityId
      }
    });
  }

  async getEntityAnomalyMetrics(entityId: string): Promise<EntityAnomalyMetrics | null> {
    return this.prismaService.entityAnomalyMetrics.findUnique({
      where: {
        entityId
      }
    });
  }

  async listReputationEventsOrdered(): Promise<ReputationEvent[]> {
    return this.prismaService.reputationEvent.findMany({
      orderBy: {
        createdAt: "asc"
      }
    });
  }

  async clearDerivedState(): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.voteWeightSnapshot.deleteMany(),
      this.prismaService.entityConfidenceProfile.deleteMany(),
      this.prismaService.entityAnomalyMetrics.deleteMany(),
      this.prismaService.entityActivityHourly.deleteMany(),
      this.prismaService.userTrustProfile.deleteMany(),
      this.prismaService.userBehaviorMetrics.deleteMany(),
      this.prismaService.userActivityDaily.deleteMany(),
      this.prismaService.userActivityHourly.deleteMany(),
      this.prismaService.userEntityStats.deleteMany(),
      this.prismaService.userEntityTypeStats.deleteMany(),
      this.prismaService.userRootDomainStats.deleteMany()
    ]);
  }

  async getVoteWeightSnapshotByRatingId(ratingId: string): Promise<VoteWeightSnapshot | null> {
    return this.prismaService.voteWeightSnapshot.findUnique({
      where: {
        ratingId
      }
    });
  }

  async resolveParentContextType(parentId: string | null): Promise<string> {
    if (!parentId) {
      return REPUTATION_ROOT_CONTEXT_TYPE;
    }

    const parent = await this.prismaService.entity.findUnique({
      select: {
        type: true
      },
      where: {
        id: parentId
      }
    });

    return parent?.type ?? REPUTATION_ROOT_CONTEXT_TYPE;
  }
}

function getScoreCountField(
  score: number
): "score1Count" | "score2Count" | "score3Count" | "score4Count" | "score5Count" {
  switch (score) {
    case 1:
      return "score1Count";
    case 2:
      return "score2Count";
    case 3:
      return "score3Count";
    case 4:
      return "score4Count";
    case 5:
      return "score5Count";
    default:
      throw new Error(`Invalid rating score: ${score}`);
  }
}
