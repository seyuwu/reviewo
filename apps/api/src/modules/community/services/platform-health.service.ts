import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../database/prisma.service.js";
import type { ContentFunnelDto, PlatformHealthDto, PlatformMetricDto } from "../dto/admin-community.dto.js";

const CONTENT_FUNNEL_PERIOD_DAYS = 30;

interface MetricRow {
  last1Day: bigint | number;
  last30Days: bigint | number;
  last7Days: bigint | number;
  total: bigint | number;
}

@Injectable()
export class PlatformHealthService {
  constructor(private readonly prismaService: PrismaService) {}

  async getPlatformHealth(): Promise<PlatformHealthDto> {
    const now = new Date();
    const last1Day = new Date(now.getTime() - 86_400_000);
    const last7Days = new Date(now.getTime() - 7 * 86_400_000);
    const last30Days = new Date(now.getTime() - CONTENT_FUNNEL_PERIOD_DAYS * 86_400_000);

    const [metrics, contentFunnel] = await Promise.all([
      this.prismaService.$queryRaw<
        Array<{
          battles: MetricRow;
          discussions: MetricRow;
          entities: MetricRow;
          ratings: MetricRow;
          reviews: MetricRow;
          tops: MetricRow;
          users: MetricRow;
        }>
      >`
        SELECT
          json_build_object(
            'total', (SELECT COUNT(*)::int FROM users.users WHERE status = 'active'),
            'last1Day', (SELECT COUNT(*)::int FROM users.users WHERE status = 'active' AND created_at >= ${last1Day}),
            'last7Days', (SELECT COUNT(*)::int FROM users.users WHERE status = 'active' AND created_at >= ${last7Days}),
            'last30Days', (SELECT COUNT(*)::int FROM users.users WHERE status = 'active' AND created_at >= ${last30Days})
          ) AS users,
          json_build_object(
            'total', (SELECT COUNT(*)::int FROM entities.entities WHERE visibility = 'ACTIVE'),
            'last1Day', (SELECT COUNT(*)::int FROM entities.entities WHERE visibility = 'ACTIVE' AND created_at >= ${last1Day}),
            'last7Days', (SELECT COUNT(*)::int FROM entities.entities WHERE visibility = 'ACTIVE' AND created_at >= ${last7Days}),
            'last30Days', (SELECT COUNT(*)::int FROM entities.entities WHERE visibility = 'ACTIVE' AND created_at >= ${last30Days})
          ) AS entities,
          json_build_object(
            'total', (SELECT COUNT(*)::int FROM ratings.ratings),
            'last1Day', (SELECT COUNT(*)::int FROM ratings.ratings WHERE created_at >= ${last1Day}),
            'last7Days', (SELECT COUNT(*)::int FROM ratings.ratings WHERE created_at >= ${last7Days}),
            'last30Days', (SELECT COUNT(*)::int FROM ratings.ratings WHERE created_at >= ${last30Days})
          ) AS ratings,
          json_build_object(
            'total', (SELECT COUNT(*)::int FROM reviews.reviews WHERE visibility = 'ACTIVE'),
            'last1Day', (SELECT COUNT(*)::int FROM reviews.reviews WHERE visibility = 'ACTIVE' AND created_at >= ${last1Day}),
            'last7Days', (SELECT COUNT(*)::int FROM reviews.reviews WHERE visibility = 'ACTIVE' AND created_at >= ${last7Days}),
            'last30Days', (SELECT COUNT(*)::int FROM reviews.reviews WHERE visibility = 'ACTIVE' AND created_at >= ${last30Days})
          ) AS reviews,
          json_build_object(
            'total', (SELECT COUNT(*)::int FROM chat.entity_chat_messages WHERE is_hidden = false),
            'last1Day', (SELECT COUNT(*)::int FROM chat.entity_chat_messages WHERE is_hidden = false AND created_at >= ${last1Day}),
            'last7Days', (SELECT COUNT(*)::int FROM chat.entity_chat_messages WHERE is_hidden = false AND created_at >= ${last7Days}),
            'last30Days', (SELECT COUNT(*)::int FROM chat.entity_chat_messages WHERE is_hidden = false AND created_at >= ${last30Days})
          ) AS discussions,
          json_build_object(
            'total', (SELECT COUNT(*)::int FROM tops.tops WHERE visibility = 'ACTIVE'),
            'last1Day', (SELECT COUNT(*)::int FROM tops.tops WHERE visibility = 'ACTIVE' AND created_at >= ${last1Day}),
            'last7Days', (SELECT COUNT(*)::int FROM tops.tops WHERE visibility = 'ACTIVE' AND created_at >= ${last7Days}),
            'last30Days', (SELECT COUNT(*)::int FROM tops.tops WHERE visibility = 'ACTIVE' AND created_at >= ${last30Days})
          ) AS tops,
          json_build_object(
            'total', (SELECT COUNT(*)::int FROM growth.battle_votes),
            'last1Day', (SELECT COUNT(*)::int FROM growth.battle_votes WHERE created_at >= ${last1Day}),
            'last7Days', (SELECT COUNT(*)::int FROM growth.battle_votes WHERE created_at >= ${last7Days}),
            'last30Days', (SELECT COUNT(*)::int FROM growth.battle_votes WHERE created_at >= ${last30Days})
          ) AS battles
      `,
      this.getContentFunnel(last30Days)
    ]);

    const row = metrics[0];

    return {
      battles: this.toMetric(row?.battles),
      contentFunnel,
      discussions: this.toMetric(row?.discussions),
      entities: this.toMetric(row?.entities),
      ratings: this.toMetric(row?.ratings),
      reviews: this.toMetric(row?.reviews),
      tops: this.toMetric(row?.tops),
      users: this.toMetric(row?.users)
    };
  }

  private async getContentFunnel(periodStart: Date): Promise<ContentFunnelDto> {
    const rows = await this.prismaService.$queryRaw<
      Array<{
        discussionsAdded: bigint | number;
        entitiesCreated: bigint | number;
        ratingsAdded: bigint | number;
        reviewsAdded: bigint | number;
        topsCreated: bigint | number;
      }>
    >`
      SELECT
        (SELECT COUNT(*)::int FROM entities.entities WHERE visibility = 'ACTIVE' AND created_at >= ${periodStart}) AS "entitiesCreated",
        (SELECT COUNT(*)::int FROM ratings.ratings WHERE created_at >= ${periodStart}) AS "ratingsAdded",
        (SELECT COUNT(*)::int FROM reviews.reviews WHERE visibility = 'ACTIVE' AND created_at >= ${periodStart}) AS "reviewsAdded",
        (SELECT COUNT(*)::int FROM chat.entity_chat_messages WHERE is_hidden = false AND created_at >= ${periodStart}) AS "discussionsAdded",
        (SELECT COUNT(*)::int FROM tops.tops WHERE visibility = 'ACTIVE' AND created_at >= ${periodStart}) AS "topsCreated"
    `;

    const row = rows[0];

    return {
      discussionsAdded: Number(row?.discussionsAdded ?? 0),
      entitiesCreated: Number(row?.entitiesCreated ?? 0),
      periodDays: CONTENT_FUNNEL_PERIOD_DAYS,
      ratingsAdded: Number(row?.ratingsAdded ?? 0),
      reviewsAdded: Number(row?.reviewsAdded ?? 0),
      topsCreated: Number(row?.topsCreated ?? 0)
    };
  }

  private toMetric(row?: MetricRow): PlatformMetricDto {
    return {
      last1Day: Number(row?.last1Day ?? 0),
      last30Days: Number(row?.last30Days ?? 0),
      last7Days: Number(row?.last7Days ?? 0),
      total: Number(row?.total ?? 0)
    };
  }
}
