import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";

import { UsersRepository } from "../../users/repositories/users.repository.js";
import {
  ContributeQueuesRepository,
  type ContributeBattleQueueItemRow,
  type ContributeQueueItemRow,
  type ContributeTopQueueItemRow
} from "../repositories/contribute-queues.repository.js";
import { ContributionBadgeRepository } from "../repositories/contribution-badge.repository.js";
import { ContributionSnapshotRepository } from "../repositories/contribution-snapshot.repository.js";
import { CuratorRankSnapshotRepository } from "../repositories/curator-rank-snapshot.repository.js";
import { ExpertiseSnapshotRepository } from "../repositories/expertise-snapshot.repository.js";
import type { ContributionProfileDto } from "../dto/contribution-profile.dto.js";
import type { ContributeQueuesResponseDto } from "../dto/contribute-queues.dto.js";
import { PrismaService } from "../../../database/prisma.service.js";

@Injectable()
export class CommunityService {
  constructor(
    private readonly contributionBadgeRepository: ContributionBadgeRepository,
    private readonly contributionSnapshotRepository: ContributionSnapshotRepository,
    private readonly contributeQueuesRepository: ContributeQueuesRepository,
    private readonly curatorRankSnapshotRepository: CuratorRankSnapshotRepository,
    private readonly expertiseSnapshotRepository: ExpertiseSnapshotRepository,
    private readonly prismaService: PrismaService,
    private readonly usersRepository: UsersRepository
  ) {}

  async getMyContributionProfile(userId: string): Promise<ContributionProfileDto> {
    return this.buildContributionProfile(userId);
  }

  async getUserContributionProfile(userId: string): Promise<ContributionProfileDto> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return this.buildContributionProfile(userId);
  }

  async getContributeQueues(limit = 20, viewerUserId?: string): Promise<ContributeQueuesResponseDto> {
    const [
      entitiesWithoutReviewsCount,
      entitiesWithoutReviews,
      entitiesWithoutLogoCount,
      entitiesWithoutLogo,
      possibleDuplicatesCount,
      possibleDuplicates,
      topsWithoutDescriptionCount,
      topsWithoutDescription,
      lowActivityBattlesCount,
      lowActivityBattles
    ] = await Promise.all([
      this.contributeQueuesRepository.countEntitiesWithoutReviews(),
      this.contributeQueuesRepository.listEntitiesWithoutReviews(limit, viewerUserId),
      this.contributeQueuesRepository.countEntitiesWithoutLogo(),
      this.contributeQueuesRepository.listEntitiesWithoutLogo(limit),
      this.contributeQueuesRepository.countPossibleDuplicates(),
      this.contributeQueuesRepository.listPossibleDuplicates(limit),
      this.contributeQueuesRepository.countTopsWithoutDescription(),
      this.contributeQueuesRepository.listTopsWithoutDescription(limit),
      this.contributeQueuesRepository.countLowActivityBattles(),
      this.contributeQueuesRepository.listLowActivityBattles(limit)
    ]);

    return {
      queues: [
        buildEntityQueue(
          "entities_without_reviews",
          entitiesWithoutReviewsCount,
          entitiesWithoutReviews,
          { reviewAnchor: true }
        ),
        buildEntityQueue("entities_without_logo", entitiesWithoutLogoCount, entitiesWithoutLogo),
        buildEntityQueue("possible_duplicates", possibleDuplicatesCount, possibleDuplicates),
        buildTopQueue("tops_without_description", topsWithoutDescriptionCount, topsWithoutDescription),
        buildBattleQueue("low_activity_battles", lowActivityBattlesCount, lowActivityBattles)
      ]
    };
  }

  private async buildContributionProfile(userId: string): Promise<ContributionProfileDto> {
    const snapshot = await this.contributionSnapshotRepository.findByUserId(userId);

    if (!snapshot) {
      return {
        badges: [],
        battleVotesCount: 0,
        curatorRanks: [],
        discussionsCount: 0,
        entitiesCreatedCount: 0,
        expertise: [],
        fieldFixesCount: 0,
        level: "newcomer",
        ratingsCount: 0,
        reviewsCount: 0,
        topsCount: 0
      };
    }

    const [badges, expertise, curatorRanks] = await Promise.all([
      this.contributionBadgeRepository.listByUserId(userId),
      this.expertiseSnapshotRepository.listByUserId(userId),
      this.curatorRankSnapshotRepository.listByUserId(userId)
    ]);

    const categoryIds = [
      ...curatorRanks.map((rank: { categoryId: string }) => rank.categoryId),
      ...expertise
        .filter((area: { scopeType: string }) => area.scopeType === "category")
        .map((area: { scopeKey: string }) => area.scopeKey)
    ];
    const uniqueCategoryIds = [...new Set(categoryIds)];
    const categories =
      uniqueCategoryIds.length > 0
        ? await this.prismaService.topCategory.findMany({
            select: { id: true, slug: true, title: true },
            where: { id: { in: uniqueCategoryIds } }
          })
        : [];
    const categoriesById = new Map(categories.map((category) => [category.id, category]));

    return {
      badges,
      battleVotesCount: snapshot.battleVotesCount,
      curatorRanks: curatorRanks.map((rank) => {
        const category = categoriesById.get(rank.categoryId);

        return {
          categoryId: rank.categoryId,
          ...(category?.slug ? { categorySlug: category.slug } : {}),
          ...(category?.title ? { categoryTitle: category.title } : {}),
          score: rank.score
        };
      }),
      discussionsCount: snapshot.discussionsCount,
      entitiesCreatedCount: snapshot.entitiesCreatedCount,
      expertise: expertise.map((area) => {
        if (area.scopeType === "category") {
          const category = categoriesById.get(area.scopeKey);

          return {
            scopeKey: category?.title ?? category?.slug ?? area.scopeKey,
            scopeType: area.scopeType as "category" | "entity_type",
            score: area.score
          };
        }

        return {
          scopeKey: area.scopeKey,
          scopeType: area.scopeType as "category" | "entity_type",
          score: area.score
        };
      }),
      fieldFixesCount: snapshot.fieldFixesCount,
      level: snapshot.level,
      ratingsCount: snapshot.ratingsCount,
      reviewsCount: snapshot.reviewsCount,
      topsCount: snapshot.topsCount
    };
  }
}

function buildEntityQueue(
  key: string,
  count: number,
  items: ContributeQueueItemRow[],
  options?: { reviewAnchor?: boolean }
) {
  return {
    count,
    items: items.map((item) => ({
      entityId: item.entityId,
      href: options?.reviewAnchor ? `/entities/${item.entityId}#entity-my-review` : `/entities/${item.entityId}`,
      slug: item.slug,
      title: item.title,
      ...(item.viewerHasRated ? { viewerHasRated: true } : {})
    })),
    key
  };
}

function buildTopQueue(key: string, count: number, items: ContributeTopQueueItemRow[]) {
  return {
    count,
    items: items.map((item) => ({
      href: `/tops/${item.slug}`,
      slug: item.slug,
      title: item.title,
      topId: item.topId
    })),
    key
  };
}

function buildBattleQueue(key: string, count: number, items: ContributeBattleQueueItemRow[]) {
  return {
    count,
    items: items.map((item) => ({
      href: `/compare/${item.pairSlug}`,
      leftSlug: item.leftSlug,
      pairSlug: item.pairSlug,
      rightSlug: item.rightSlug,
      title: `${item.leftSlug} vs ${item.rightSlug}`,
      totalVotes: item.totalVotes
    })),
    key
  };
}
