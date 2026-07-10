import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import { CONTRIBUTION_SCORE_POINTS } from "../constants/contribution-score.js";
import { SPOTLIGHT_MIN_TRUST_SCORE } from "../constants/spotlight-credits.js";
import type {
  AdminContributorDto,
  AdminContributorsResponseDto,
  ContributionSourceItemDto,
  EconomyOverviewDto
} from "../dto/admin-community.dto.js";
import { ActivityEventsRepository } from "../repositories/activity-events.repository.js";
import { ContributionScoreCalculator } from "./contribution-score-calculator.service.js";
import { PlatformHealthService } from "./platform-health.service.js";
import { SpotlightAnalyticsService } from "./spotlight-analytics.service.js";

@Injectable()
export class AdminCommunityService {
  private readonly scoreCalculator = new ContributionScoreCalculator();

  constructor(
    private readonly activityEventsRepository: ActivityEventsRepository,
    private readonly platformHealthService: PlatformHealthService,
    private readonly prismaService: PrismaService,
    private readonly spotlightAnalyticsService: SpotlightAnalyticsService
  ) {}

  getPlatformHealth() {
    return this.platformHealthService.getPlatformHealth();
  }

  async getEconomyOverview(): Promise<EconomyOverviewDto> {
    const [
      usersByLevel,
      usersWithBalance,
      usersWithScoreAboveZero,
      usersLevelContributorOrAbove,
      usersEligibleForSpotlight,
      ledgerStats,
      placementsByType,
      activitySourceRows
    ] = await Promise.all([
      this.prismaService.userContributionSnapshot.groupBy({
        _count: { _all: true },
        by: ["level"],
        orderBy: { level: "asc" }
      }),
      this.prismaService.spotlightCreditBalance.count({
        where: { balance: { gt: 0 } }
      }),
      this.prismaService.userContributionSnapshot.count({
        where: { contributionScore: { gt: 0 } }
      }),
      this.prismaService.userContributionSnapshot.count({
        where: {
          level: {
            in: ["contributor", "active_contributor", "curator", "pioneer"]
          }
        }
      }),
      this.prismaService.$queryRaw<Array<{ count: bigint | number }>>`
        SELECT COUNT(*)::int AS count
        FROM reputation.user_trust_profiles
        WHERE trust_score >= ${SPOTLIGHT_MIN_TRUST_SCORE}
      `,
      this.prismaService.$queryRaw<
        Array<{
          creditsExpired: bigint | number;
          creditsGranted: bigint | number;
          creditsSpent: bigint | number;
        }>
      >`
        SELECT
          COALESCE(SUM(CASE WHEN amount > 0 AND reason = 'monthly_grant' THEN amount ELSE 0 END), 0)::int AS "creditsGranted",
          COALESCE(SUM(CASE WHEN amount < 0 AND reason = 'monthly_expiry' THEN ABS(amount) ELSE 0 END), 0)::int AS "creditsExpired",
          COALESCE(SUM(CASE WHEN amount < 0 AND reason LIKE 'spend_%' THEN ABS(amount) ELSE 0 END), 0)::int AS "creditsSpent"
        FROM community.spotlight_credit_ledger
      `,
      this.prismaService.spotlightPlacement.groupBy({
        _count: { _all: true },
        by: ["placementType"],
        orderBy: { placementType: "asc" }
      }),
      this.prismaService.$queryRaw<Array<{ actionType: string; eventCount: bigint | number }>>`
        SELECT action_type AS "actionType", COUNT(*)::int AS "eventCount"
        FROM community.activity_events
        GROUP BY action_type
      `
    ]);

    const ledger = ledgerStats[0];

    return {
      contributionSources: this.buildContributionSources(activitySourceRows),
      creditsExpired: Number(ledger?.creditsExpired ?? 0),
      creditsGranted: Number(ledger?.creditsGranted ?? 0),
      creditsSpent: Number(ledger?.creditsSpent ?? 0),
      placementsByType: placementsByType.map((row) => ({
        count: row._count._all,
        placementType: row.placementType
      })),
      usersByLevel: usersByLevel.map((row) => ({
        count: row._count._all,
        level: row.level
      })),
      usersEligibleForSpotlight: Number(usersEligibleForSpotlight[0]?.count ?? 0),
      usersLevelContributorOrAbove,
      usersWithBalance,
      usersWithScoreAboveZero
    };
  }

  getSpotlightAnalytics(days?: number) {
    return this.spotlightAnalyticsService.getAnalytics(days);
  }

  async listTopContributors(limit = 50, cursor?: string): Promise<AdminContributorsResponseDto> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const cursorParts = cursor?.split(":") ?? [];
    const cursorScore = cursorParts[0] ? Number.parseInt(cursorParts[0], 10) : undefined;
    const cursorUserId = cursorParts[1];

    const snapshots = await this.prismaService.userContributionSnapshot.findMany({
      include: {
        user: {
          select: {
            displayName: true
          }
        }
      },
      orderBy: [{ contributionScore: "desc" }, { userId: "asc" }],
      take: safeLimit + 1,
      ...(cursorScore !== undefined && cursorUserId
        ? {
            where: {
              OR: [
                { contributionScore: { lt: cursorScore } },
                {
                  contributionScore: cursorScore,
                  userId: { gt: cursorUserId }
                }
              ]
            }
          }
        : {})
    });

    const page = snapshots.slice(0, safeLimit);
    const hasMore = snapshots.length > safeLimit;

    const items: AdminContributorDto[] = await Promise.all(
      page.map(async (snapshot) => {
        const events = await this.activityEventsRepository.listByUserId(snapshot.userId);
        const breakdown = this.scoreCalculator.calculateBreakdown(events);

        return {
          contributionScore: snapshot.contributionScore,
          displayName: snapshot.user.displayName,
          lastActivityAt: snapshot.lastActivityAt?.toISOString() ?? null,
          level: snapshot.level,
          scoreBreakdown: Object.entries(breakdown.byActionType)
            .map(([actionType, value]) => ({
              actionType,
              points: value.points,
              rawCount: value.rawCount
            }))
            .sort((left, right) => right.points - left.points),
          snapshotCounts: {
            battleVotesCount: snapshot.battleVotesCount,
            discussionsCount: snapshot.discussionsCount,
            entitiesCreatedCount: snapshot.entitiesCreatedCount,
            fieldFixesCount: snapshot.fieldFixesCount,
            ratingsCount: snapshot.ratingsCount,
            reviewsCount: snapshot.reviewsCount,
            topsCount: snapshot.topsCount
          },
          userId: snapshot.userId
        };
      })
    );

    const last = page.at(-1);

    return {
      items,
      nextCursor:
        hasMore && last ? `${last.contributionScore}:${last.userId}` : null
    };
  }

  private buildContributionSources(
    rows: Array<{ actionType: string; eventCount: bigint | number }>
  ): ContributionSourceItemDto[] {
    const scored = rows
      .map((row) => {
        const eventCount = Number(row.eventCount);
        const pointWeight = CONTRIBUTION_SCORE_POINTS[row.actionType] ?? 0;
        const points = eventCount * pointWeight;

        return {
          actionType: row.actionType,
          eventCount,
          points
        };
      })
      .filter((row) => row.points > 0)
      .sort((left, right) => right.points - left.points);

    const totalPoints = scored.reduce((sum, row) => sum + row.points, 0);

    if (totalPoints === 0) {
      return [];
    }

    const primary = scored.slice(0, 8);
    const remainder = scored.slice(8);
    const items: ContributionSourceItemDto[] = primary.map((row) => ({
      actionType: row.actionType,
      eventCount: row.eventCount,
      points: row.points,
      sharePercent: Math.round((row.points / totalPoints) * 1000) / 10
    }));

    if (remainder.length > 0) {
      const otherPoints = remainder.reduce((sum, row) => sum + row.points, 0);
      const otherEvents = remainder.reduce((sum, row) => sum + row.eventCount, 0);

      items.push({
        actionType: "other",
        eventCount: otherEvents,
        points: otherPoints,
        sharePercent: Math.round((otherPoints / totalPoints) * 1000) / 10
      });
    }

    return items;
  }
}
