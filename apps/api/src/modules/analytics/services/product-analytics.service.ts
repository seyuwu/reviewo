import { Injectable } from "@nestjs/common";
import {
  bucketAnalyticsPath,
  funnelStepForPath,
  isAnalyticsCounterKey,
  isAnalyticsCtaKey,
  isAnalyticsPathKey,
  type AnalyticsCounterKey,
  type AnalyticsCtaKey,
  type AnalyticsPathKey
} from "@reviewo/shared";

import { AnalyticsRepository } from "../repositories/analytics.repository.js";

@Injectable()
export class ProductAnalyticsService {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async collect(input: {
    events: Array<{ count?: number; durationMs?: number; key?: string; type: string }>;
    visitorId: string;
  }): Promise<{ ok: true }> {
    const counters: Partial<Record<AnalyticsCounterKey, number>> = {};
    const ctas: Partial<Record<AnalyticsCtaKey, number>> = {};
    const pathTimes: Partial<Record<AnalyticsPathKey, { samples: number; timeMs: number }>> = {};
    const scopes = new Set<"dota">();

    for (const event of input.events) {
      const count = Math.max(1, Math.min(20, Math.floor(event.count ?? 1)));

      if (event.type === "pageview") {
        counters.pageviews = (counters.pageviews ?? 0) + count;
        const funnel = funnelStepForPath(event.key ?? "/");

        if (funnel) {
          counters[funnel] = (counters[funnel] ?? 0) + count;
        }

        continue;
      }

      if (event.type === "counter" && event.key && isAnalyticsCounterKey(event.key)) {
        counters[event.key] = (counters[event.key] ?? 0) + count;

        if (event.key === "dota_host_pageviews") {
          scopes.add("dota");
        }

        continue;
      }

      if (event.type === "cta" && event.key && isAnalyticsCtaKey(event.key)) {
        ctas[event.key] = (ctas[event.key] ?? 0) + count;
        continue;
      }

      if (event.type === "page_time" && event.key && typeof event.durationMs === "number") {
        const pathKey = isAnalyticsPathKey(event.key)
          ? event.key
          : bucketAnalyticsPath(event.key);

        if (!pathTimes[pathKey]) {
          pathTimes[pathKey] = { samples: 0, timeMs: 0 };
        }

        pathTimes[pathKey]!.samples += count;
        pathTimes[pathKey]!.timeMs += Math.max(0, Math.floor(event.durationMs));
      }
    }

    const hasWork =
      Object.keys(counters).length > 0 ||
      Object.keys(ctas).length > 0 ||
      Object.keys(pathTimes).length > 0;

    if (!hasWork) {
      return { ok: true };
    }

    await this.analyticsRepository.ingestBatch({
      counters,
      ctas,
      pathTimes,
      scopes: [...scopes],
      visitorId: input.visitorId
    });

    return { ok: true };
  }

  recordRegistration(): Promise<void> {
    return this.analyticsRepository.recordRegistration();
  }

  recordWaitlistInterestSubmit(): Promise<void> {
    return this.analyticsRepository.incrementCounter("waitlist_interest_submit", 1);
  }

  getOverview(days: number) {
    return this.analyticsRepository.getOverview(days);
  }

  getWaitlistMetrics(days: number) {
    return this.analyticsRepository.getWaitlistMetrics(days);
  }
}
