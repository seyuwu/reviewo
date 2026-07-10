import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import { ActivityActionType } from "../constants/activity-action-type.js";
import { ActivityEventsRepository } from "../repositories/activity-events.repository.js";
import { ContributionSnapshotService } from "./contribution-snapshot.service.js";

@Injectable()
export class ContributionPhase2BackfillService implements OnModuleInit {
  private readonly logger = new Logger(ContributionPhase2BackfillService.name);

  constructor(
    private readonly activityEventsRepository: ActivityEventsRepository,
    private readonly contributionSnapshotService: ContributionSnapshotService,
    private readonly prismaService: PrismaService
  ) {}

  async onModuleInit(): Promise<void> {
    const likedEventCount = await this.prismaService.activityEvent.count({
      where: { actionType: ActivityActionType.TopLiked }
    });

    if (likedEventCount === 0) {
      await this.backfillRecognitionEvents();
    }

    const staleSnapshots = await this.prismaService.userContributionSnapshot.count({
      where: { contributionScore: 0 }
    });

    if (staleSnapshots === 0) {
      return;
    }

    const snapshots = await this.prismaService.userContributionSnapshot.findMany({
      select: { userId: true },
      where: { contributionScore: 0 }
    });

    for (const snapshot of snapshots) {
      await this.contributionSnapshotService.recomputeForUser(snapshot.userId);
    }

    this.logger.log(`Phase 2 snapshot recompute complete: ${snapshots.length} users`);
  }

  private async backfillRecognitionEvents(): Promise<void> {
    const likes = await this.prismaService.topLike.findMany({
      select: {
        createdAt: true,
        id: true,
        top: {
          select: {
            authorId: true,
            categoryId: true
          }
        },
        userId: true
      }
    });

    let likesBackfilled = 0;
    let forksBackfilled = 0;
    let forkTopsBackfilled = 0;

    for (const like of likes) {
      if (like.top.authorId === like.userId) {
        continue;
      }

      const created = await this.activityEventsRepository.append({
        actionType: ActivityActionType.TopLiked,
        categoryId: like.top.categoryId,
        createdAt: like.createdAt,
        sourceId: like.id,
        targetUserId: like.userId,
        userId: like.top.authorId
      });

      if (created) {
        likesBackfilled += 1;
      }
    }

    const forks = await this.prismaService.top.findMany({
      select: {
        authorId: true,
        categoryId: true,
        createdAt: true,
        forkedFrom: {
          select: {
            authorId: true,
            categoryId: true
          }
        },
        id: true
      },
      where: {
        forkedFromId: { not: null },
        visibility: "ACTIVE"
      }
    });

    for (const fork of forks) {
      if (!fork.forkedFrom || fork.forkedFrom.authorId === fork.authorId) {
        continue;
      }

      const forkedEvent = await this.activityEventsRepository.append({
        actionType: ActivityActionType.TopForked,
        categoryId: fork.forkedFrom.categoryId,
        createdAt: fork.createdAt,
        sourceId: fork.id,
        targetUserId: fork.authorId,
        userId: fork.forkedFrom.authorId
      });

      if (forkedEvent) {
        forksBackfilled += 1;
      }

      const topCreatedEvent = await this.activityEventsRepository.append({
        actionType: ActivityActionType.TopCreated,
        categoryId: fork.categoryId,
        createdAt: fork.createdAt,
        sourceId: fork.id,
        userId: fork.authorId
      });

      if (topCreatedEvent) {
        forkTopsBackfilled += 1;
      }
    }

    this.logger.log(
      `Phase 2 recognition backfill: ${likesBackfilled} likes, ${forksBackfilled} forks, ${forkTopsBackfilled} fork tops`
    );
  }
}
