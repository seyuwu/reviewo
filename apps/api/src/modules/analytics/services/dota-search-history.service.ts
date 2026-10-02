import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DOTA_PARTY_VERTICAL } from "@reviewo/shared";

import { PrismaService } from "../../../database/prisma.service.js";

export type DotaSearchType = "SOLO" | "RECRUIT";
export type DotaSearchOutcome = "JOINED" | "CANCELLED";

type SearchEvent =
  | {
      at: Date;
      expiresAt: Date;
      kind: "solo-start";
      source: "telegram" | "web";
      userId: string;
    }
  | {
      at: Date;
      kind: "solo-finish";
      outcome: DotaSearchOutcome;
      userId: string;
    }
  | {
      at: Date;
      expiresAt: Date;
      initialMemberCount: number;
      kind: "recruit-start";
      partyId: string;
      partyName: string;
      source: "telegram" | "web";
      userId: string;
    }
  | {
      at: Date;
      kind: "recruit-member-count";
      memberCount: number;
      partyId: string;
    }
  | {
      at: Date;
      kind: "recruit-stop";
      partyId: string;
    }
  | {
      at: Date;
      kind: "recruit-stop-slug";
      partySlug: string;
    };

const FLUSH_INTERVAL_MS = 500;
const FLUSH_BATCH_SIZE = 200;
const MAX_QUEUED_EVENTS = 10_000;

@Injectable()
export class DotaSearchHistoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DotaSearchHistoryService.name);
  private readonly pendingEvents: SearchEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private isFlushing = false;
  private consecutiveFailures = 0;
  private retryAfter = 0;
  private overflowWarningLogged = false;

  constructor(private readonly prismaService: PrismaService) {}

  onModuleInit(): void {
    this.flushTimer = setInterval(() => {
      void this.flushPendingEvents();
    }, FLUSH_INTERVAL_MS).unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    while (this.pendingEvents.length > 0) {
      const sizeBeforeFlush = this.pendingEvents.length;
      await this.flushPendingEvents();
      if (this.pendingEvents.length >= sizeBeforeFlush) {
        break;
      }
    }
  }

  startSoloSearch(input: { expiresAt: Date; source: "telegram" | "web"; userId: string }): void {
    this.enqueue({ ...input, at: new Date(), kind: "solo-start" });
  }

  finishSoloSearch(userId: string, outcome: DotaSearchOutcome): void {
    this.enqueue({ at: new Date(), kind: "solo-finish", outcome, userId });
  }

  startPartyRecruitSearch(input: {
    expiresAt: Date;
    initialMemberCount: number;
    partyId: string;
    partyName: string;
    source: "telegram" | "web";
    userId: string;
  }): void {
    this.enqueue({ ...input, at: new Date(), kind: "recruit-start" });
  }

  updatePartyRecruitMemberCount(partyId: string, memberCount: number): void {
    this.enqueue({ at: new Date(), kind: "recruit-member-count", memberCount, partyId });
  }

  stopPartyRecruitSearch(partyId: string): void {
    this.enqueue({ at: new Date(), kind: "recruit-stop", partyId });
  }

  stopPartyRecruitSearchBySlug(partySlug: string): void {
    this.enqueue({ at: new Date(), kind: "recruit-stop-slug", partySlug });
  }

  async getSearchHistory(input: {
    days: number;
    searchType: DotaSearchType;
    limit?: number;
  }): Promise<
    Array<{
      durationSeconds: number;
      id: string;
      matchedCount: number;
      partyName: string | null;
      searchType: DotaSearchType;
      source: "telegram" | "web";
      startedAt: string;
      status: "ACTIVE" | "JOINED" | "CANCELLED" | "EXPIRED";
      userName: string;
    }>
  > {
    const days = Math.max(1, Math.min(365, Math.floor(input.days)));
    const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 200)));
    const startedAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prismaService.$queryRaw<
      Array<{
        duration_seconds: number;
        id: string;
        matched_count: number;
        party_name: string | null;
        search_type: DotaSearchType;
        source: "telegram" | "web";
        started_at: Date;
        status: "ACTIVE" | "JOINED" | "CANCELLED" | "EXPIRED";
        user_name: string;
      }>
    >`
      SELECT
        s.id::text AS id,
        s.search_type,
        s.source,
        CASE
          WHEN s.status = 'SEARCHING'
            AND s.expires_at <= NOW()
            AND s.search_type = 'RECRUIT'
            AND s.matched_count > 0 THEN 'JOINED'
          WHEN s.status = 'SEARCHING' AND s.expires_at <= NOW() THEN 'EXPIRED'
          WHEN s.status = 'SEARCHING' THEN 'ACTIVE'
          ELSE s.status
        END AS status,
        s.started_at,
        GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (
            COALESCE(s.finished_at, CASE WHEN s.expires_at <= NOW() THEN s.expires_at ELSE NOW() END)
            - s.started_at
          )))
        )::int AS duration_seconds,
        s.matched_count,
        COALESCE(NULLIF(u.display_name, ''), u.username, 'Player') AS user_name,
        COALESCE(s.party_name, p.name) AS party_name
      FROM social.dota_search_sessions s
      LEFT JOIN users.users u ON u.id = s.user_id
      LEFT JOIN social.game_parties p ON p.id = s.party_id
      WHERE s.started_at >= ${startedAfter}
        AND s.search_type = ${input.searchType}
      ORDER BY s.started_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      durationSeconds: Number(row.duration_seconds),
      id: row.id,
      matchedCount: Number(row.matched_count),
      partyName: row.party_name,
      searchType: row.search_type,
      source: row.source,
      startedAt: row.started_at.toISOString(),
      status: row.status,
      userName: row.user_name
    }));
  }

  private enqueue(event: SearchEvent): void {
    if (this.pendingEvents.length >= MAX_QUEUED_EVENTS) {
      if (!this.overflowWarningLogged) {
        this.logger.warn("Dota search history queue is full; dropping analytics events");
        this.overflowWarningLogged = true;
      }
      return;
    }
    this.pendingEvents.push(event);
  }

  private async flushPendingEvents(): Promise<void> {
    if (this.isFlushing || this.pendingEvents.length === 0 || Date.now() < this.retryAfter) {
      return;
    }

    this.isFlushing = true;
    const batch = this.pendingEvents.splice(0, FLUSH_BATCH_SIZE);

    try {
      await this.prismaService.$transaction(async (tx) => {
        for (const event of batch) {
          await this.persistEvent(tx, event);
        }
      });
      this.consecutiveFailures = 0;
      this.retryAfter = 0;
      this.overflowWarningLogged = false;
    } catch (error) {
      this.pendingEvents.unshift(...batch);
      this.consecutiveFailures += 1;
      this.retryAfter = Date.now() + Math.min(30_000, 500 * 2 ** (this.consecutiveFailures - 1));
      const message = `Could not flush ${batch.length} Dota search history events: ${
        error instanceof Error ? error.message : String(error)
      }`;
      if (this.consecutiveFailures === 1) {
        this.logger.error(message);
      } else {
        this.logger.warn(message);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async persistEvent(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    event: SearchEvent
  ): Promise<void> {
    switch (event.kind) {
      case "solo-start":
        await tx.$executeRaw`
          UPDATE social.dota_search_sessions
          SET status = 'EXPIRED', finished_at = expires_at
          WHERE user_id = ${event.userId}::uuid
            AND search_type = 'SOLO'
            AND status = 'SEARCHING'
            AND expires_at <= ${event.at}
        `;
        await tx.$executeRaw`
          INSERT INTO social.dota_search_sessions
            (user_id, search_type, source, status, started_at, expires_at)
          VALUES
            (${event.userId}::uuid, 'SOLO', ${event.source}, 'SEARCHING', ${event.at}, ${event.expiresAt})
          ON CONFLICT (user_id)
            WHERE search_type = 'SOLO' AND status = 'SEARCHING'
          DO UPDATE SET expires_at = EXCLUDED.expires_at
        `;
        return;
      case "solo-finish":
        await tx.$executeRaw`
          UPDATE social.dota_search_sessions
          SET status = ${event.outcome}, finished_at = ${event.at}
          WHERE user_id = ${event.userId}::uuid
            AND search_type = 'SOLO'
            AND status = 'SEARCHING'
            AND started_at <= ${event.at}
        `;
        return;
      case "recruit-start":
        await tx.$executeRaw`
          UPDATE social.dota_search_sessions
          SET status = 'EXPIRED', finished_at = expires_at
          WHERE party_id = ${event.partyId}::uuid
            AND search_type = 'RECRUIT'
            AND status = 'SEARCHING'
            AND expires_at <= ${event.at}
        `;
        await tx.$executeRaw`
          INSERT INTO social.dota_search_sessions
            (user_id, party_id, party_name, search_type, source, status, initial_member_count, started_at, expires_at)
          VALUES
            (${event.userId}::uuid, ${event.partyId}::uuid, ${event.partyName}, 'RECRUIT', ${event.source}, 'SEARCHING', ${event.initialMemberCount}, ${event.at}, ${event.expiresAt})
          ON CONFLICT (party_id)
            WHERE search_type = 'RECRUIT' AND status = 'SEARCHING'
          DO UPDATE SET expires_at = EXCLUDED.expires_at
        `;
        return;
      case "recruit-member-count":
        await tx.$executeRaw`
          UPDATE social.dota_search_sessions
          SET matched_count = GREATEST(matched_count, ${event.memberCount} - initial_member_count)
          WHERE party_id = ${event.partyId}::uuid
            AND search_type = 'RECRUIT'
            AND status = 'SEARCHING'
            AND started_at <= ${event.at}
        `;
        return;
      case "recruit-stop":
        await tx.$executeRaw`
          UPDATE social.dota_search_sessions
          SET status = CASE WHEN matched_count > 0 THEN 'JOINED' ELSE 'CANCELLED' END,
              finished_at = ${event.at}
          WHERE party_id = ${event.partyId}::uuid
            AND search_type = 'RECRUIT'
            AND status = 'SEARCHING'
            AND started_at <= ${event.at}
        `;
        return;
      case "recruit-stop-slug":
        await tx.$executeRaw`
          UPDATE social.dota_search_sessions AS s
          SET status = CASE WHEN s.matched_count > 0 THEN 'JOINED' ELSE 'CANCELLED' END,
              finished_at = ${event.at}
          FROM social.game_parties AS p
          WHERE s.party_id = p.id
            AND p.vertical = ${DOTA_PARTY_VERTICAL}
            AND p.slug = ${event.partySlug}
            AND s.search_type = 'RECRUIT'
            AND s.status = 'SEARCHING'
            AND s.started_at <= ${event.at}
        `;
    }
  }
}
