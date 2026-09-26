import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  DOTA_ATTRIBUTE_KEYS,
  DOTA_VERTICAL,
  dotaHostVisitorScopeKey,
  isAnalyticsCounterKey,
  isAnalyticsCtaKey,
  isAnalyticsPathKey,
  isDotaHostVisitorScopeKey,
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
    scopes?: Array<"dota">;
    visitorId: string;
  }): Promise<void> {
    const day = this.utcDay();
    const visitorHash = this.hashVisitorId(input.visitorId);
    const visitorRows = [{ day, visitorHash }];

    if (input.scopes?.includes("dota")) {
      visitorRows.push({ day, visitorHash: dotaHostVisitorScopeKey(visitorHash) });
    }

    await this.prismaService.$transaction(async (tx) => {
      await tx.analyticsDailyVisitor.createMany({
        data: visitorRows,
        skipDuplicates: true
      });

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

  async incrementCounter(key: AnalyticsCounterKey, delta = 1): Promise<void> {
    if (!isAnalyticsCounterKey(key) || delta < 1) {
      return;
    }

    const day = this.utcDay();

    await this.prismaService.$executeRaw`
      INSERT INTO community.analytics_daily_counters (day, key, value)
      VALUES (${day}, ${key}, ${BigInt(delta)})
      ON CONFLICT (day, key)
      DO UPDATE SET value = community.analytics_daily_counters.value + EXCLUDED.value
    `;
  }

  async recordRegistration(): Promise<void> {
    await this.incrementCounter("registrations", 1);
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
    telegramBot: {
      accounts: number;
      accountsConnectedInRange: number;
      activeSearchUsers: number;
      soloSearchUsers: number;
      recruitingParties: number;
      openSlots: number;
    };
    platformTotals: {
      accounts: number;
      activeAccounts: number;
      accountsCreatedInRange: number;
      dotaProfiles: number;
      dotaParties: number;
      activeDotaParties: number;
    };
    topCtas: Array<{ clicks: number; ctaKey: string }>;
  }> {
    const safeDays = Math.min(90, Math.max(1, Math.floor(days)));
    const end = this.utcDay();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (safeDays - 1));

    const nextDay = new Date(end);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const [
      counters,
      visitors,
      ctas,
      pathTimes,
      telegramAccountStats,
      activeSearches,
      accounts,
      activeAccounts,
      accountsCreatedInRange,
      dotaProfiles,
      dotaParties,
      activeDotaParties
    ] = await Promise.all([
      this.prismaService.analyticsDailyCounter.findMany({
        where: {
          day: {
            gte: start,
            lte: end
          }
        }
      }),
      this.prismaService.analyticsDailyVisitor.findMany({
        select: { day: true, visitorHash: true },
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
      }),
      this.prismaService.$queryRaw<
        Array<{ accounts: bigint | number; accountsConnectedInRange: bigint | number }>
      >`
        SELECT
          COUNT(DISTINCT identity.user_id)::int AS accounts,
          COUNT(DISTINCT identity.user_id) FILTER (
            WHERE identity.created_at >= ${start}
              AND identity.created_at < ${nextDay}
          )::int AS "accountsConnectedInRange"
        FROM auth.user_auth_identities identity
        JOIN users.users app_user ON app_user.id = identity.user_id
        WHERE identity.provider = 'telegram'
          AND app_user.status = 'active'
      `,
      this.prismaService.$queryRaw<
        Array<{
          recruitingParties: bigint | number;
          recruitingUsers: bigint | number;
          soloUsers: bigint | number;
          openSlots: bigint | number;
        }>
      >`
        WITH telegram_searches AS (
          SELECT
            e.owner_user_id,
            MAX(CASE WHEN party_slug.key = 'lfg_party_slug' THEN party_slug.value END) AS party_slug,
            MAX(CASE WHEN recruited_roles.key = 'lfg_recruited_roles' THEN recruited_roles.value END) AS recruited_roles
          FROM entities.entities e
          JOIN entities.entity_attributes vertical
            ON vertical.entity_id = e.id
            AND vertical.key = ${DOTA_ATTRIBUTE_KEYS.vertical}
            AND vertical.value = ${DOTA_VERTICAL}
          JOIN entities.entity_attributes lfg_until
            ON lfg_until.entity_id = e.id
            AND lfg_until.key = ${DOTA_ATTRIBUTE_KEYS.lfgUntil}
            AND lfg_until.value > ${new Date().toISOString()}
          JOIN auth.user_auth_identities telegram_identity
            ON telegram_identity.user_id = e.owner_user_id
            AND telegram_identity.provider = 'telegram'
          JOIN users.users telegram_user
            ON telegram_user.id = telegram_identity.user_id
            AND telegram_user.status = 'active'
          LEFT JOIN entities.entity_attributes party_slug
            ON party_slug.entity_id = e.id AND party_slug.key = ${DOTA_ATTRIBUTE_KEYS.lfgPartySlug}
          LEFT JOIN entities.entity_attributes recruited_roles
            ON recruited_roles.entity_id = e.id AND recruited_roles.key = ${DOTA_ATTRIBUTE_KEYS.lfgRecruitedRoles}
          WHERE e.type = 'person'
            AND e.visibility = 'ACTIVE'
          GROUP BY e.id, e.owner_user_id
        )
        SELECT
          COUNT(DISTINCT owner_user_id) FILTER (
            WHERE COALESCE(party_slug, '') = ''
          )::int AS "soloUsers",
          COUNT(DISTINCT owner_user_id) FILTER (
            WHERE COALESCE(party_slug, '') <> '' AND COALESCE(recruited_roles, '') <> ''
          )::int AS "recruitingUsers",
          COUNT(DISTINCT party_slug) FILTER (
            WHERE COALESCE(party_slug, '') <> '' AND COALESCE(recruited_roles, '') <> ''
          )::int AS "recruitingParties",
          COALESCE(SUM(array_length(regexp_split_to_array(recruited_roles, ','), 1)) FILTER (
            WHERE COALESCE(party_slug, '') <> '' AND COALESCE(recruited_roles, '') <> ''
          ), 0)::int AS "openSlots"
        FROM telegram_searches
      `,
      this.prismaService.user.count(),
      this.prismaService.user.count({ where: { status: "active" } }),
      this.prismaService.user.count({ where: { createdAt: { gte: start, lt: nextDay } } }),
      this.prismaService.entity.count({
        where: {
          attributes: {
            some: { key: DOTA_ATTRIBUTE_KEYS.vertical, value: DOTA_VERTICAL }
          },
          type: "person"
        }
      }),
      this.prismaService.gameParty.count({ where: { vertical: DOTA_VERTICAL } }),
      this.prismaService.gameParty.count({
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          vertical: DOTA_VERTICAL
        }
      })
    ]);

    const activeSearch = activeSearches[0];
    const telegramAccounts = telegramAccountStats[0];
    const soloSearchUsers = Number(activeSearch?.soloUsers ?? 0);
    const recruitingUsers = Number(activeSearch?.recruitingUsers ?? 0);
    const platformTotals = {
      accounts,
      activeAccounts,
      accountsCreatedInRange,
      dotaProfiles,
      dotaParties,
      activeDotaParties
    };

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

    const globalUniquesByDay = new Map<string, number>();

    for (const row of visitors) {
      if (isDotaHostVisitorScopeKey(row.visitorHash)) {
        continue;
      }

      const key = row.day.toISOString().slice(0, 10);
      globalUniquesByDay.set(key, (globalUniquesByDay.get(key) ?? 0) + 1);
    }

    for (const [key, uniques] of globalUniquesByDay) {
      const bucket = byDayMap.get(key);

      if (bucket) {
        bucket.uniques = uniques;
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

    const uniqueVisitorDays = [...globalUniquesByDay.values()].reduce((sum, value) => sum + value, 0);
    const daysWithTraffic = [...globalUniquesByDay.values()].filter((value) => value > 0).length;

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
      telegramBot: {
        accounts: Number(telegramAccounts?.accounts ?? 0),
        accountsConnectedInRange: Number(telegramAccounts?.accountsConnectedInRange ?? 0),
        activeSearchUsers: soloSearchUsers + recruitingUsers,
        soloSearchUsers,
        recruitingParties: Number(activeSearch?.recruitingParties ?? 0),
        openSlots: Number(activeSearch?.openSlots ?? 0)
      },
      platformTotals,
      topCtas
    };
  }

  async getWaitlistMetrics(days: number): Promise<{
    conversionFormStartPct: number | null;
    conversionSubmitPct: number | null;
    createProfileClicks: number;
    dotaHostPageviews: number;
    dotaHostUniques: number;
    formStarts: number;
    interestSubmits: number;
    inviteClicks: number;
    inviteVisits: number;
    profileShareClicks: number;
    rangeDays: number;
    telegramJoins: number;
  }> {
    const safeDays = Math.min(90, Math.max(1, Math.floor(days)));
    const end = this.utcDay();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (safeDays - 1));

    const [counters, dotaUniques, ctas] = await Promise.all([
      this.prismaService.analyticsDailyCounter.findMany({
        where: {
          day: { gte: start, lte: end },
          key: { in: ["dota_host_pageviews", "waitlist_interest_submit"] }
        }
      }),
      this.prismaService.analyticsDailyVisitor.count({
        where: {
          day: { gte: start, lte: end },
          visitorHash: { startsWith: "dota:" }
        }
      }),
      this.prismaService.analyticsDailyCta.findMany({
        where: {
          day: { gte: start, lte: end },
          ctaKey: {
            in: [
              "games_waitlist_form_start",
              "games_waitlist_telegram_join",
              "games_waitlist_invite_click",
              "games_waitlist_invite_visit",
              "games_waitlist_create_profile_click",
              "dota_share_profile"
            ]
          }
        }
      })
    ]);

    let dotaHostPageviews = 0;
    let interestSubmits = 0;

    for (const row of counters) {
      const value = Number(row.value);

      if (row.key === "dota_host_pageviews") {
        dotaHostPageviews += value;
      }

      if (row.key === "waitlist_interest_submit") {
        interestSubmits += value;
      }
    }

    let formStarts = 0;
    let telegramJoins = 0;
    let inviteClicks = 0;
    let inviteVisits = 0;
    let createProfileClicks = 0;
    let profileShareClicks = 0;

    for (const row of ctas) {
      const value = Number(row.clicks);

      if (row.ctaKey === "games_waitlist_form_start") {
        formStarts += value;
      }

      if (row.ctaKey === "games_waitlist_telegram_join") {
        telegramJoins += value;
      }

      if (row.ctaKey === "games_waitlist_invite_click") {
        inviteClicks += value;
      }

      if (row.ctaKey === "games_waitlist_invite_visit") {
        inviteVisits += value;
      }

      if (row.ctaKey === "games_waitlist_create_profile_click") {
        createProfileClicks += value;
      }

      if (row.ctaKey === "dota_share_profile") {
        profileShareClicks += value;
      }
    }

    return {
      conversionFormStartPct: pct(formStarts, dotaUniques),
      conversionSubmitPct: pct(interestSubmits, formStarts),
      createProfileClicks,
      dotaHostPageviews,
      dotaHostUniques: dotaUniques,
      formStarts,
      interestSubmits,
      inviteClicks,
      inviteVisits,
      profileShareClicks,
      rangeDays: safeDays,
      telegramJoins
    };
  }
}

function pct(part: number, whole: number): number | null {
  if (whole < 1) {
    return null;
  }

  return Math.round((part / whole) * 1000) / 10;
}
