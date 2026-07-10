import { Injectable } from "@nestjs/common";

import { ActivityActionType } from "../constants/activity-action-type.js";
import { calculateContributionBadges } from "../constants/contribution-badge.js";
import { ActivityEventsRepository } from "../repositories/activity-events.repository.js";
import { ContributionBadgeRepository } from "../repositories/contribution-badge.repository.js";
import { ContributionSnapshotRepository } from "../repositories/contribution-snapshot.repository.js";
import { CuratorRankSnapshotRepository } from "../repositories/curator-rank-snapshot.repository.js";
import { ExpertiseSnapshotRepository } from "../repositories/expertise-snapshot.repository.js";
import { ContributionLevelCalculator } from "../services/contribution-level-calculator.service.js";
import { ContributionScoreCalculator } from "../services/contribution-score-calculator.service.js";
import { CuratorRankCalculator } from "../services/curator-rank-calculator.service.js";
import { ExpertiseCalculator } from "../services/expertise-calculator.service.js";

@Injectable()
export class ContributionSnapshotService {
  private readonly levelCalculator = new ContributionLevelCalculator();
  private readonly scoreCalculator = new ContributionScoreCalculator();
  private readonly expertiseCalculator = new ExpertiseCalculator();
  private readonly curatorRankCalculator = new CuratorRankCalculator();

  constructor(
    private readonly activityEventsRepository: ActivityEventsRepository,
    private readonly contributionBadgeRepository: ContributionBadgeRepository,
    private readonly contributionSnapshotRepository: ContributionSnapshotRepository,
    private readonly curatorRankSnapshotRepository: CuratorRankSnapshotRepository,
    private readonly expertiseSnapshotRepository: ExpertiseSnapshotRepository
  ) {}

  async recomputeForUser(userId: string) {
    const counts = await this.activityEventsRepository.countByUserGrouped(userId);
    const events = await this.activityEventsRepository.listByUserId(userId);
    const lastActivityAt = await this.activityEventsRepository.getLastActivityAt(userId);

    const ratingsCount = counts.get(ActivityActionType.RatingCreated) ?? 0;
    const reviewsCount = counts.get(ActivityActionType.ReviewCreated) ?? 0;
    const battleVotesCount = counts.get(ActivityActionType.BattleVote) ?? 0;
    const topsCount = counts.get(ActivityActionType.TopCreated) ?? 0;
    const entitiesCreatedCount = counts.get(ActivityActionType.EntityCreated) ?? 0;
    const fieldFixesCount = counts.get(ActivityActionType.ContributionApproved) ?? 0;
    const discussionsCount = counts.get(ActivityActionType.DiscussionCreated) ?? 0;

    const level = this.levelCalculator.calculate({
      battleVotesCount,
      discussionsCount,
      entitiesCreatedCount,
      fieldFixesCount,
      lastActivityAt,
      ratingsCount,
      reviewsCount,
      topsCount
    });

    const contributionScore = this.scoreCalculator.calculate(events);
    const expertise = this.expertiseCalculator.calculate(events);
    const curatorStats = await this.curatorRankSnapshotRepository.getCategoryStats(userId);
    const curatorRanks = this.curatorRankCalculator.calculate(curatorStats);
    const recognition = await this.curatorRankSnapshotRepository.countRecognitionReceived(userId);
    const badges = calculateContributionBadges({
      battleVotesCount,
      discussionsCount,
      entitiesCreatedCount,
      fieldFixesCount,
      forksReceivedCount: recognition.forksReceivedCount,
      level,
      likesReceivedCount: recognition.likesReceivedCount,
      ratingsCount,
      reviewsCount,
      topsCount
    });

    const snapshot = await this.contributionSnapshotRepository.upsert({
      battleVotesCount,
      contributionScore,
      discussionsCount,
      entitiesCreatedCount,
      fieldFixesCount,
      lastActivityAt,
      level,
      ratingsCount,
      reviewsCount,
      topsCount,
      userId
    });

    await Promise.all([
      this.contributionBadgeRepository.replaceForUser(userId, badges),
      this.expertiseSnapshotRepository.replaceForUser(userId, expertise),
      this.curatorRankSnapshotRepository.replaceForUser(userId, curatorRanks)
    ]);

    return snapshot;
  }
}
