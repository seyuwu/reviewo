import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  isAnalyticsCounterKey,
  isAnalyticsCtaKey,
  isAnalyticsPathKey,
  type AnalyticsCounterKey,
  type AnalyticsCtaKey,
  type AnalyticsPathKey
} from "@reviewo/shared";

import { PrismaService } from "../../../database/prisma.service.js";

const MAX_TIME_MS_PER_SAMPLE = 30 * 60 * 1000;

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prismaService: PrismaService) {}

  utcDay(date = new Date()): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  hashVisitorId(visitorId: string): string {
    return createHash("sha256").update(visitorId.trim().toLowerCase()).digest("hex").slice(0, 32);
  }

  async ingestBatch(input: {
    counters: Partial<Record<AnalyticsCounterKey, number>>;
    ctas: Partial<Record<AnalyticsCtaKey, number>>;
    pathTimes: Partial<Record<AnalyticsPathKey, { samples: number; timeMs: number }>>;
    visitorId: string;
  }): Promise<void> {
    const day = this.utcDay();
    const visitorHash = this.hashVisitorId(input.visitorId);

    await this.prismaService.$transaction(async (tx) => {
      const visitorInsert = await tx.analyticsDailyVisitor.createMany({
        data: [{ day, visitorHash }],
        skipDuplicates: true
      });

      if (visitorInsert.count > 0) {
        // First sighting of this visitor today — counted via visitors table for uniques.
      }

      for (const [key, delta] of Object.entries(input.counters)) {
        if (!isAnalyticsCounterKey(key) || !delta || delta < 1) {
          continue;
        }

        await tx.$executeRaw`
          INSERT INTO community.analytics_daily_counters (day, key, value)
          VALUES (${day}, ${key}, ${BigInt(delta)})
          ON CONFLICT (day, key)
          DO UPDATE SET value = community.analytics_daily_counters.value + EXCLUDED.value
        `;
      }

      for (const [ctaKey, delta] of Object.entries(input.ctas)) {
        if (!isAnalyticsCtaKey(ctaKey) || !delta || delta < 1) {
          continue;
        }

        await tx.$executeRaw`
          INSERT INTO community.analytics_daily_ctas (day, cta_key, clicks)
          VALUES (${day}, ${ctaKey}, ${BigInt(delta)})
          ON CONFLICT (day, cta_key)
          DO UPDATE SET clicks = community.analytics_daily_ctas.clicks + EXCLUDED.clicks
        `;
      }

      for (const [pathKey, payload] of Object.entries(input.pathTimes)) {
        if (!isAnalyticsPathKey(pathKey) || !payload) {
          continue;
        }

        const samples = Math.max(0, Math.min(20, Math.floor(payload.samples)));
        const timeMs = Math.max(
          0,
          Math.min(samples * MAX_TIME_MS_PER_SAMPLE, Math.floor(payload.timeMs))
        );

        if (samples < 1 || timeMs < 1) {
          continue;
        }

        await tx.$executeRaw`
          INSERT INTO community.analytics_daily_path_times (day, path_key, time_ms_sum, sample_count)
          VALUES (${day}, ${pathKey}, ${BigInt(timeMs)}, ${BigInt(samples)})
          ON CONFLICT (day, path_key)
          DO UPDATE SET
            time_ms_sum = community.analytics_daily_path_times.time_ms_sum + EXCLUDED.time_ms_sum,
            sample_count = community.analytics_daily_path_times.sample_count + EXCLUDED.sample_count
        `;
      }
    });
  }

  async recordRegistration(): Promise<void> {
    const day = this.utcDay();

    await this.prismaService.$executeRaw`
      INSERT INTO community.analytics_daily_counters (day, key, value)
      VALUES (${day}, ${"registrations"}, ${BigInt(1)})
      ON CONFLICT (day, key)
      DO UPDATE SET value = community.analytics_daily_counters.value + EXCLUDED.value
    `;
  }

  async getOverview(days: number): Promise<{
    averagesByPath: Array<{ avgSeconds: number; pathKey: string; samples: number }>;
    byDay: Array<{
      day: string;
      pageviews: number;
      registrations: number;
      uniques: number;
    }>;
    funnel: Record<string, number>;
    rangeDays: number;
    totals: {
      avgDailyUniques: number | null;
      avgSecondsOnSite: number | null;
      pageviews: number;
      registrations: number;
      /** Sum of per-day unique visitors (same person on 2 days counts twice). */
      uniqueVisitorDays: number;
    };
    topCtas: Array<{ clicks: number; ctaKey: string }>;
  }> {
    const safeDays = Math.min(90, Math.max(1, Math.floor(days)));
    const end = this.utcDay();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (safeDays - 1));

    const [counters, visitors, ctas, pathTimes] = await Promise.all([
      this.prismaService.analyticsDailyCounter.findMany({
        where: {
          day: {
            gte: start,
            lte: end
          }
        }
      }),
      this.prismaService.analyticsDailyVisitor.groupBy({
        by: ["day"],
        _count: { _all: true },
        where: {
          day: {
            gte: start,
            lte: end
          }
        }
      }),
      this.prismaService.analyticsDailyCta.findMany({
        where: {
          day: {
            gte: start,
            lte: end
          }
        }
      }),
      this.prismaService.analyticsDailyPathTime.findMany({
        where: {
          day: {
            gte: start,
            lte: end
          }
        }
      })
    ]);

    const byDayMap = new Map<string, { pageviews: number; registrations: number; uniques: number }>();

    for (let offset = 0; offset < safeDays; offset += 1) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + offset);
      byDayMap.set(day.toISOString().slice(0, 10), {
        pageviews: 0,
        registrations: 0,
        uniques: 0
      });
    }

    for (const row of visitors) {
      const key = row.day.toISOString().slice(0, 10);
      const bucket = byDayMap.get(key);

      if (bucket) {
        bucket.uniques = row._count._all;
      }
    }

    const funnel: Record<string, number> = {
      funnel_dota: 0,
      funnel_dota_profile: 0,
      funnel_games: 0,
      funnel_home: 0,
      funnel_register: 0
    };

    let totalPageviews = 0;
    let totalRegistrations = 0;

    for (const row of counters) {
      const dayKey = row.day.toISOString().slice(0, 10);
      const value = Number(row.value);
      const bucket = byDayMap.get(dayKey);

      if (row.key === "pageviews") {
        totalPageviews += value;
        if (bucket) {
          bucket.pageviews = value;
        }
      }

      if (row.key === "registrations") {
        totalRegistrations += value;
        if (bucket) {
          bucket.registrations = value;
        }
      }

      if (row.key in funnel) {
        funnel[row.key] = (funnel[row.key] ?? 0) + value;
      }
    }

    const ctaTotals = new Map<string, number>();

    for (const row of ctas) {
      ctaTotals.set(row.ctaKey, (ctaTotals.get(row.ctaKey) ?? 0) + Number(row.clicks));
    }

    const topCtas = [...ctaTotals.entries()]
      .map(([ctaKey, clicks]) => ({ clicks, ctaKey }))
      .sort((left, right) => right.clicks - left.clicks)
      .slice(0, 20);

    const pathAgg = new Map<string, { samples: number; timeMs: number }>();

    for (const row of pathTimes) {
      const current = pathAgg.get(row.pathKey) ?? { samples: 0, timeMs: 0 };
      current.samples += Number(row.sampleCount);
      current.timeMs += Number(row.timeMsSum);
      pathAgg.set(row.pathKey, current);
    }

    const averagesByPath = [...pathAgg.entries()]
      .map(([pathKey, value]) => ({
        avgSeconds: value.samples > 0 ? Math.round(value.timeMs / value.samples / 1000) : 0,
        pathKey,
        samples: value.samples
      }))
      .sort((left, right) => right.samples - left.samples);

    const totalTimeMs = averagesByPath.reduce((sum, row) => {
      const raw = pathAgg.get(row.pathKey);
      return sum + (raw?.timeMs ?? 0);
    }, 0);
    const totalSamples = averagesByPath.reduce((sum, row) => sum + row.samples, 0);

    const uniqueVisitorDays = visitors.reduce((sum, row) => sum + row._count._all, 0);
    const daysWithTraffic = visitors.filter((row) => row._count._all > 0).length;

    return {
      averagesByPath,
      byDay: [...byDayMap.entries()].map(([day, values]) => ({ day, ...values })),
      funnel,
      rangeDays: safeDays,
      totals: {
        avgDailyUniques:
          daysWithTraffic > 0 ? Math.round(uniqueVisitorDays / daysWithTraffic) : null,
        avgSecondsOnSite: totalSamples > 0 ? Math.round(totalTimeMs / totalSamples / 1000) : null,
        pageviews: totalPageviews,
        registrations: totalRegistrations,
        uniqueVisitorDays
      },
      topCtas
    };
  }
}
