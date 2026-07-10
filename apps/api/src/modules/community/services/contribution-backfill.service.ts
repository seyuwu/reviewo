import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import { ActivityActionType } from "../constants/activity-action-type.js";
import { ActivityEventsRepository } from "../repositories/activity-events.repository.js";
import { ContributionSnapshotService } from "./contribution-snapshot.service.js";

@Injectable()
export class ContributionBackfillService implements OnModuleInit {
  private readonly logger = new Logger(ContributionBackfillService.name);

  constructor(
    private readonly activityEventsRepository: ActivityEventsRepository,
    private readonly contributionSnapshotService: ContributionSnapshotService,
    private readonly prismaService: PrismaService
  ) {}

  async onModuleInit(): Promise<void> {
    const existingCount = await this.activityEventsRepository.countAll();

    if (existingCount > 0) {
      return;
    }

    this.logger.log("Backfilling community activity events from historical data");

    const affectedUserIds = new Set<string>();

    const ratings = await this.prismaService.rating.findMany({
      select: {
        createdAt: true,
        entityId: true,
        id: true,
        userId: true
      }
    });

    for (const rating of ratings) {
      const entity = await this.prismaService.entity.findUnique({
        select: { type: true },
        where: { id: rating.entityId }
      });
      const created = await this.activityEventsRepository.append({
        actionType: ActivityActionType.RatingCreated,
        createdAt: rating.createdAt,
        entityId: rating.entityId,
        entityType: entity?.type ?? null,
        sourceId: rating.id,
        userId: rating.userId
      });

      if (created) {
        affectedUserIds.add(rating.userId);
      }
    }

    const reviews = await this.prismaService.review.findMany({
      select: {
        authorId: true,
        createdAt: true,
        entityId: true,
        id: true
      },
      where: {
        visibility: "ACTIVE"
      }
    });

    for (const review of reviews) {
      const entity = await this.prismaService.entity.findUnique({
        select: { type: true },
        where: { id: review.entityId }
      });
      const created = await this.activityEventsRepository.append({
        actionType: ActivityActionType.ReviewCreated,
        createdAt: review.createdAt,
        entityId: review.entityId,
        entityType: entity?.type ?? null,
        sourceId: review.id,
        userId: review.authorId
      });

      if (created) {
        affectedUserIds.add(review.authorId);
      }
    }

    const battleVotes = await this.prismaService.battleVote.findMany({
      select: {
        createdAt: true,
        entityId: true,
        id: true,
        userId: true
      },
      where: {
        userId: {
          not: null
        }
      }
    });

    for (const vote of battleVotes) {
      if (!vote.userId) {
        continue;
      }

      const entity = await this.prismaService.entity.findUnique({
        select: { type: true },
        where: { id: vote.entityId }
      });
      const created = await this.activityEventsRepository.append({
        actionType: ActivityActionType.BattleVote,
        createdAt: vote.createdAt,
        entityId: vote.entityId,
        entityType: entity?.type ?? null,
        sourceId: vote.id,
        userId: vote.userId
      });

      if (created) {
        affectedUserIds.add(vote.userId);
      }
    }

    const tops = await this.prismaService.top.findMany({
      select: {
        authorId: true,
        categoryId: true,
        createdAt: true,
        id: true
      },
      where: {
        visibility: "ACTIVE"
      }
    });

    for (const top of tops) {
      const created = await this.activityEventsRepository.append({
        actionType: ActivityActionType.TopCreated,
        categoryId: top.categoryId,
        createdAt: top.createdAt,
        sourceId: top.id,
        userId: top.authorId
      });

      if (created) {
        affectedUserIds.add(top.authorId);
      }
    }

    const entities = await this.prismaService.entity.findMany({
      select: {
        createdAt: true,
        createdBy: true,
        id: true,
        type: true
      },
      where: {
        createdBy: {
          not: null
        },
        visibility: "ACTIVE"
      }
    });

    for (const entity of entities) {
      if (!entity.createdBy) {
        continue;
      }

      const created = await this.activityEventsRepository.append({
        actionType: ActivityActionType.EntityCreated,
        createdAt: entity.createdAt,
        entityId: entity.id,
        entityType: entity.type,
        sourceId: entity.id,
        userId: entity.createdBy
      });

      if (created) {
        affectedUserIds.add(entity.createdBy);
      }
    }

    const contributions = await this.prismaService.entityContribution.findMany({
      select: {
        authorId: true,
        appliedAt: true,
        createdAt: true,
        entityId: true,
        id: true,
        type: true
      },
      where: {
        status: "APPLIED"
      }
    });

    for (const contribution of contributions) {
      const entity = await this.prismaService.entity.findUnique({
        select: { type: true },
        where: { id: contribution.entityId }
      });
      const created = await this.activityEventsRepository.append({
        actionType: ActivityActionType.ContributionApproved,
        createdAt: contribution.appliedAt ?? contribution.createdAt,
        entityId: contribution.entityId,
        entityType: entity?.type ?? null,
        payload: {
          contributionType: contribution.type
        },
        sourceId: contribution.id,
        userId: contribution.authorId
      });

      if (created) {
        affectedUserIds.add(contribution.authorId);
      }
    }

    const messages = await this.prismaService.entityChatMessage.findMany({
      select: {
        createdAt: true,
        entityId: true,
        id: true,
        userId: true
      },
      where: {
        isHidden: false
      }
    });

    for (const message of messages) {
      const entity = await this.prismaService.entity.findUnique({
        select: { type: true },
        where: { id: message.entityId }
      });
      const created = await this.activityEventsRepository.append({
        actionType: ActivityActionType.DiscussionCreated,
        createdAt: message.createdAt,
        entityId: message.entityId,
        entityType: entity?.type ?? null,
        sourceId: message.id,
        userId: message.userId
      });

      if (created) {
        affectedUserIds.add(message.userId);
      }
    }

    for (const userId of affectedUserIds) {
      await this.contributionSnapshotService.recomputeForUser(userId);
    }

    this.logger.log(`Backfill complete: ${affectedUserIds.size} user snapshots updated`);
  }
}
