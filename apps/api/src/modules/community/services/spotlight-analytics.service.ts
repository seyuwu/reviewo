import { Injectable } from "@nestjs/common";
import type { SpotlightPlacementType } from "#prisma/client";

import { PrismaService } from "../../../database/prisma.service.js";
import { SPOTLIGHT_ATTRIBUTION_WINDOW_DAYS } from "../constants/spotlight-analytics.js";
import type {
  SpotlightAnalyticsDto,
  SpotlightConversionMetricsDto,
  SpotlightTopPlacementDto,
  SpotlightTypePerformanceDto
} from "../dto/admin-community.dto.js";

interface PlacementMetricRow {
  clicks: bigint | number;
  impressions: bigint | number;
  placementType: SpotlightPlacementType;
}

interface PlacementSpendRow {
  creditsSpent: bigint | number;
  placements: bigint | number;
  placementType: SpotlightPlacementType;
}

const ALL_PLACEMENT_TYPES: SpotlightPlacementType[] = [
  "entity_spotlight",
  "battle_boost",
  "top_highlight"
];

interface TopPlacementRow {
  clicks: bigint | number;
  endsAt: Date;
  impressions: bigint | number;
  placementId: string;
  placementType: SpotlightPlacementType;
  sponsorDisplayName: string;
  startsAt: Date;
  title: string;
}

@Injectable()
export class SpotlightAnalyticsService {
  constructor(private readonly prismaService: PrismaService) {}

  async getAnalytics(days = 30): Promise<SpotlightAnalyticsDto> {
    const safeDays = Math.max(1, Math.min(days, 365));
    const periodStart = new Date(Date.now() - safeDays * 86_400_000);

    const [byTypeRows, spendRows, topPlacementRows] = await Promise.all([
      this.prismaService.$queryRaw<PlacementMetricRow[]>`
        SELECT
          sp.placement_type AS "placementType",
          COUNT(*) FILTER (WHERE spe.event_type = 'impression')::int AS impressions,
          COUNT(*) FILTER (WHERE spe.event_type = 'click')::int AS clicks
        FROM community.spotlight_placement_events spe
        INNER JOIN community.spotlight_placements sp ON sp.id = spe.placement_id
        WHERE spe.created_at >= ${periodStart}
        GROUP BY sp.placement_type
        ORDER BY sp.placement_type
      `,
      this.prismaService.$queryRaw<PlacementSpendRow[]>`
        SELECT
          placement_type AS "placementType",
          COALESCE(SUM(cost), 0)::int AS "creditsSpent",
          COUNT(*)::int AS placements
        FROM community.spotlight_placements
        WHERE created_at >= ${periodStart}
        GROUP BY placement_type
        ORDER BY placement_type
      `,
      this.prismaService.$queryRaw<TopPlacementRow[]>`
        SELECT
          sp.id AS "placementId",
          sp.placement_type AS "placementType",
          sp.starts_at AS "startsAt",
          sp.ends_at AS "endsAt",
          u.display_name AS "sponsorDisplayName",
          COALESCE(e.title, t.title, REPLACE(sp.pair_slug, '-vs-', ' vs '), sp.id::text) AS title,
          COUNT(*) FILTER (WHERE spe.event_type = 'impression')::int AS impressions,
          COUNT(*) FILTER (WHERE spe.event_type = 'click')::int AS clicks
        FROM community.spotlight_placements sp
        INNER JOIN users.users u ON u.id = sp.user_id
        LEFT JOIN entities.entities e ON e.id = sp.entity_id
        LEFT JOIN tops.tops t ON t.id = sp.top_id
        LEFT JOIN community.spotlight_placement_events spe
          ON spe.placement_id = sp.id
          AND spe.created_at >= ${periodStart}
        WHERE sp.created_at >= ${periodStart}
        GROUP BY sp.id, sp.placement_type, sp.starts_at, sp.ends_at, u.display_name, e.title, t.title, sp.pair_slug
        ORDER BY clicks DESC, impressions DESC
        LIMIT 20
      `
    ]);

    const metricsByType = new Map(
      byTypeRows.map((row) => [
        row.placementType,
        {
          clicks: Number(row.clicks),
          impressions: Number(row.impressions)
        }
      ])
    );
    const spendByType = new Map(
      spendRows.map((row) => [
        row.placementType,
        {
          creditsSpent: Number(row.creditsSpent),
          placements: Number(row.placements)
        }
      ])
    );

    const byType = await Promise.all(
      ALL_PLACEMENT_TYPES.map(async (placementType) => {
        const metrics = metricsByType.get(placementType) ?? { clicks: 0, impressions: 0 };
        const spend = spendByType.get(placementType) ?? { creditsSpent: 0, placements: 0 };
        const impressions = metrics.impressions;
        const clicks = metrics.clicks;
        const conversions = await this.getConversionsForType(placementType, periodStart);

        return {
          clicks,
          conversions,
          creditsSpent: spend.creditsSpent,
          ctr: impressions > 0 ? clicks / impressions : 0,
          impressions,
          placements: spend.placements,
          placementType
        } satisfies SpotlightTypePerformanceDto;
      })
    );

    const topPlacements = await Promise.all(
      topPlacementRows.map(async (row) => {
        const impressions = Number(row.impressions);
        const clicks = Number(row.clicks);
        const conversions = await this.getConversionsForPlacement(row.placementId, periodStart);

        return {
          clicks,
          conversions,
          ctr: impressions > 0 ? clicks / impressions : 0,
          endsAt: row.endsAt.toISOString(),
          impressions,
          placementId: row.placementId,
          placementType: row.placementType,
          sponsorDisplayName: row.sponsorDisplayName,
          startsAt: row.startsAt.toISOString(),
          title: row.title
        } satisfies SpotlightTopPlacementDto;
      })
    );

    return {
      byType,
      periodDays: safeDays,
      topPlacements
    };
  }

  private async getConversionsForType(
    placementType: SpotlightPlacementType,
    periodStart: Date
  ): Promise<SpotlightConversionMetricsDto> {
    if (placementType === "entity_spotlight") {
      const [rating, review, discussion] = await Promise.all([
        this.countEntityActivityConversions("rating.created", periodStart),
        this.countEntityActivityConversions("review.created", periodStart),
        this.countEntityActivityConversions("discussion.created", periodStart)
      ]);

      return { discussion, rating, review };
    }

    if (placementType === "battle_boost") {
      const battleVote = await this.countBattleVoteConversions(periodStart);
      return { battleVote };
    }

    const [like, fork] = await Promise.all([
      this.countTopLikeConversions(periodStart),
      this.countTopForkConversions(periodStart)
    ]);

    return { fork, like };
  }

  private async getConversionsForPlacement(
    placementId: string,
    periodStart: Date
  ): Promise<SpotlightConversionMetricsDto> {
    const placement = await this.prismaService.spotlightPlacement.findUnique({
      select: {
        entityId: true,
        pairKey: true,
        placementType: true,
        topId: true
      },
      where: { id: placementId }
    });

    if (!placement) {
      return {};
    }

    if (placement.placementType === "entity_spotlight" && placement.entityId) {
      const [rating, review, discussion] = await Promise.all([
        this.countEntityActivityConversionsForPlacement(
          placementId,
          placement.entityId,
          "rating.created",
          periodStart
        ),
        this.countEntityActivityConversionsForPlacement(
          placementId,
          placement.entityId,
          "review.created",
          periodStart
        ),
        this.countEntityActivityConversionsForPlacement(
          placementId,
          placement.entityId,
          "discussion.created",
          periodStart
        )
      ]);

      return { discussion, rating, review };
    }

    if (placement.placementType === "battle_boost" && placement.pairKey) {
      const battleVote = await this.countBattleVoteConversionsForPlacement(
        placementId,
        placement.pairKey,
        periodStart
      );

      return { battleVote };
    }

    if (placement.placementType === "top_highlight" && placement.topId) {
      const [like, fork] = await Promise.all([
        this.countTopLikeConversionsForPlacement(placementId, placement.topId, periodStart),
        this.countTopForkConversionsForPlacement(placementId, placement.topId, periodStart)
      ]);

      return { fork, like };
    }

    return {};
  }

  private async countEntityActivityConversions(actionType: string, periodStart: Date): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT ae.id)::int AS count
      FROM community.spotlight_placement_events click
      INNER JOIN community.spotlight_placements sp ON sp.id = click.placement_id
      INNER JOIN community.activity_events ae
        ON ae.user_id = click.user_id
        AND ae.entity_id = sp.entity_id
        AND ae.action_type = ${actionType}
        AND ae.created_at >= click.created_at
        AND ae.created_at <= click.created_at + (${SPOTLIGHT_ATTRIBUTION_WINDOW_DAYS} * INTERVAL '1 day')
      WHERE click.event_type = 'click'
        AND click.user_id IS NOT NULL
        AND sp.placement_type = 'entity_spotlight'
        AND click.created_at >= ${periodStart}
    `;

    return Number(rows[0]?.count ?? 0);
  }

  private async countEntityActivityConversionsForPlacement(
    placementId: string,
    entityId: string,
    actionType: string,
    periodStart: Date
  ): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT ae.id)::int AS count
      FROM community.spotlight_placement_events click
      INNER JOIN community.activity_events ae
        ON ae.user_id = click.user_id
        AND ae.entity_id = ${entityId}::uuid
        AND ae.action_type = ${actionType}
        AND ae.created_at >= click.created_at
        AND ae.created_at <= click.created_at + (${SPOTLIGHT_ATTRIBUTION_WINDOW_DAYS} * INTERVAL '1 day')
      WHERE click.event_type = 'click'
        AND click.user_id IS NOT NULL
        AND click.placement_id = ${placementId}::uuid
        AND click.created_at >= ${periodStart}
    `;

    return Number(rows[0]?.count ?? 0);
  }

  private async countBattleVoteConversions(periodStart: Date): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT bv.id)::int AS count
      FROM community.spotlight_placement_events click
      INNER JOIN community.spotlight_placements sp ON sp.id = click.placement_id
      INNER JOIN growth.battle_votes bv
        ON bv.pair_key = sp.pair_key
        AND bv.user_id = click.user_id
        AND bv.created_at >= click.created_at
        AND bv.created_at <= click.created_at + (${SPOTLIGHT_ATTRIBUTION_WINDOW_DAYS} * INTERVAL '1 day')
      WHERE click.event_type = 'click'
        AND click.user_id IS NOT NULL
        AND sp.placement_type = 'battle_boost'
        AND click.created_at >= ${periodStart}
    `;

    return Number(rows[0]?.count ?? 0);
  }

  private async countBattleVoteConversionsForPlacement(
    placementId: string,
    pairKey: string,
    periodStart: Date
  ): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT bv.id)::int AS count
      FROM community.spotlight_placement_events click
      INNER JOIN growth.battle_votes bv
        ON bv.pair_key = ${pairKey}
        AND bv.user_id = click.user_id
        AND bv.created_at >= click.created_at
        AND bv.created_at <= click.created_at + (${SPOTLIGHT_ATTRIBUTION_WINDOW_DAYS} * INTERVAL '1 day')
      WHERE click.event_type = 'click'
        AND click.user_id IS NOT NULL
        AND click.placement_id = ${placementId}::uuid
        AND click.created_at >= ${periodStart}
    `;

    return Number(rows[0]?.count ?? 0);
  }

  private async countTopLikeConversions(periodStart: Date): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT tl.id)::int AS count
      FROM community.spotlight_placement_events click
      INNER JOIN community.spotlight_placements sp ON sp.id = click.placement_id
      INNER JOIN tops.top_likes tl
        ON tl.top_id = sp.top_id
        AND tl.user_id = click.user_id
        AND tl.created_at >= click.created_at
        AND tl.created_at <= click.created_at + (${SPOTLIGHT_ATTRIBUTION_WINDOW_DAYS} * INTERVAL '1 day')
      WHERE click.event_type = 'click'
        AND click.user_id IS NOT NULL
        AND sp.placement_type = 'top_highlight'
        AND click.created_at >= ${periodStart}
    `;

    return Number(rows[0]?.count ?? 0);
  }

  private async countTopLikeConversionsForPlacement(
    placementId: string,
    topId: string,
    periodStart: Date
  ): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT tl.id)::int AS count
      FROM community.spotlight_placement_events click
      INNER JOIN tops.top_likes tl
        ON tl.top_id = ${topId}::uuid
        AND tl.user_id = click.user_id
        AND tl.created_at >= click.created_at
        AND tl.created_at <= click.created_at + (${SPOTLIGHT_ATTRIBUTION_WINDOW_DAYS} * INTERVAL '1 day')
      WHERE click.event_type = 'click'
        AND click.user_id IS NOT NULL
        AND click.placement_id = ${placementId}::uuid
        AND click.created_at >= ${periodStart}
    `;

    return Number(rows[0]?.count ?? 0);
  }

  private async countTopForkConversions(periodStart: Date): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT fork.id)::int AS count
      FROM community.spotlight_placement_events click
      INNER JOIN community.spotlight_placements sp ON sp.id = click.placement_id
      INNER JOIN tops.tops fork
        ON fork.forked_from_id = sp.top_id
        AND fork.author_id = click.user_id
        AND fork.created_at >= click.created_at
        AND fork.created_at <= click.created_at + (${SPOTLIGHT_ATTRIBUTION_WINDOW_DAYS} * INTERVAL '1 day')
      WHERE click.event_type = 'click'
        AND click.user_id IS NOT NULL
        AND sp.placement_type = 'top_highlight'
        AND click.created_at >= ${periodStart}
    `;

    return Number(rows[0]?.count ?? 0);
  }

  private async countTopForkConversionsForPlacement(
    placementId: string,
    topId: string,
    periodStart: Date
  ): Promise<number> {
    const rows = await this.prismaService.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT fork.id)::int AS count
      FROM community.spotlight_placement_events click
      INNER JOIN tops.tops fork
        ON fork.forked_from_id = ${topId}::uuid
        AND fork.author_id = click.user_id
        AND fork.created_at >= click.created_at
        AND fork.created_at <= click.created_at + (${SPOTLIGHT_ATTRIBUTION_WINDOW_DAYS} * INTERVAL '1 day')
      WHERE click.event_type = 'click'
        AND click.user_id IS NOT NULL
        AND click.placement_id = ${placementId}::uuid
        AND click.created_at >= ${periodStart}
    `;

    return Number(rows[0]?.count ?? 0);
  }
}
