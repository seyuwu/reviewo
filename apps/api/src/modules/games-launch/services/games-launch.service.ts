import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DOTA_ATTRIBUTE_KEYS, DOTA_VERTICAL } from "@reviewo/shared";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import type { AuthenticatedUser } from "../../../common/interfaces/authenticated-request.js";
import { PrismaService } from "../../../database/prisma.service.js";
import type {
  CreateGamesLaunchInterestDto,
  CreateGamesLaunchSuggestionDto,
  GamesLaunchStatusDto
} from "../dto/games-launch.dto.js";
import {
  GAMES_LAUNCH_AT_ISO,
  GAMES_LAUNCH_SETTING_ID,
  GAMES_LAUNCH_STATUS_CACHE_TTL_MS
} from "../games-launch.constants.js";
import { GamesLaunchSheetsService } from "./games-launch-sheets.service.js";
import { ProductAnalyticsService } from "../../analytics/services/product-analytics.service.js";

type CachedLaunchStatus = Omit<GamesLaunchStatusDto, "devNoteLiked">;

@Injectable()
export class GamesLaunchService {
  private statusCache: { expiresAt: number; value: CachedLaunchStatus } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sheets: GamesLaunchSheetsService,
    private readonly productAnalytics: ProductAnalyticsService
  ) {}

  async getStatus(input?: {
    userId?: string;
    voterKey?: string;
  }): Promise<GamesLaunchStatusDto> {
    const now = Date.now();
    let cached = this.statusCache;

    if (!cached || cached.expiresAt <= now) {
      const value = await this.loadStatus();
      cached = {
        expiresAt: now + GAMES_LAUNCH_STATUS_CACHE_TTL_MS,
        value
      };
      this.statusCache = cached;
    }

    const voterKey = resolveVoterKey(input?.userId, input?.voterKey);
    const devNoteLiked = voterKey ? await this.hasDevNoteLike(voterKey) : false;

    return {
      ...cached.value,
      devNoteLiked
    };
  }

  /** Fresh read for gates (still uses short cache). */
  async isSearchLive(): Promise<boolean> {
    const status = await this.getStatus();
    return status.searchLive;
  }

  /** Team/party creation + community invites (search/LFG may still be closed). */
  async isCommunityOpen(): Promise<boolean> {
    const status = await this.getStatus();
    return status.communityOpen || status.searchLive;
  }

  async updateSettings(
    input: { communityOpen?: boolean; searchLive?: boolean },
    currentUser: AuthenticatedUser
  ): Promise<GamesLaunchStatusDto> {
    if (input.searchLive === undefined && input.communityOpen === undefined) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Provide searchLive and/or communityOpen",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const current = await this.prisma.gamesLaunchSetting.findUnique({
      where: { id: GAMES_LAUNCH_SETTING_ID }
    });

    // Full Games open/close owns both flags (legacy "open search" button).
    // Community-only toggle is allowed only while search is closed.
    let searchLive = current?.searchLive ?? false;
    let communityOpen = current?.communityOpen ?? false;

    if (input.searchLive !== undefined) {
      searchLive = input.searchLive;
      communityOpen = input.searchLive;
    } else if (input.communityOpen !== undefined) {
      if (searchLive) {
        throw createAppException({
          code: AppErrorCode.ValidationError,
          message: "Close teammate search before changing community-only mode",
          statusCode: HttpStatus.BAD_REQUEST
        });
      }

      communityOpen = input.communityOpen;
    }

    await this.prisma.gamesLaunchSetting.upsert({
      create: {
        communityOpen,
        id: GAMES_LAUNCH_SETTING_ID,
        searchLive,
        updatedByUserId: currentUser.id
      },
      update: {
        communityOpen,
        searchLive,
        updatedByUserId: currentUser.id
      },
      where: { id: GAMES_LAUNCH_SETTING_ID }
    });

    this.invalidateStatusCache();
    return this.getStatus({ userId: currentUser.id });
  }

  async createInterest(
    input: CreateGamesLaunchInterestDto,
    userId?: string
  ): Promise<{ ok: true }> {
    const contact = input.contact.trim();

    if (contact.length < 2) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Contact is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    if (
      (input.channel === "email" || input.channel === "newsletter") &&
      !contact.includes("@")
    ) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Enter a valid email",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const row = await this.prisma.gamesLaunchInterest.create({
      data: {
        channel: input.channel,
        contact,
        id: randomUUID(),
        ...(userId ? { userId } : {})
      }
    });

    void this.sheets.appendInterest(row);
    void this.productAnalytics.recordWaitlistInterestSubmit();
    this.invalidateStatusCache();
    return { ok: true };
  }

  async createSuggestion(
    input: CreateGamesLaunchSuggestionDto,
    userId?: string
  ): Promise<{ ok: true }> {
    const body = input.body.trim();
    const contact = input.contact?.trim() || null;

    if (body.length < 3) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Suggestion is too short",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const row = await this.prisma.gamesLaunchSuggestion.create({
      data: {
        body,
        contact,
        id: randomUUID(),
        source: input.source,
        ...(userId ? { userId } : {})
      }
    });

    void this.sheets.appendSuggestion(row);
    return { ok: true };
  }

  async listInterests(limit = 100): Promise<{
    items: Array<{
      id: string;
      channel: string;
      contact: string;
      userId: string | null;
      createdAt: string;
    }>;
    total: number;
    sheetsConfigured: boolean;
  }> {
    const take = clampLimit(limit);
    const [items, total] = await Promise.all([
      this.prisma.gamesLaunchInterest.findMany({
        orderBy: { createdAt: "desc" },
        take
      }),
      this.prisma.gamesLaunchInterest.count()
    ]);

    return {
      items: items.map((item) => ({
        channel: item.channel,
        contact: item.contact,
        createdAt: item.createdAt.toISOString(),
        id: item.id,
        userId: item.userId
      })),
      sheetsConfigured: this.sheets.isConfigured(),
      total
    };
  }

  async listSuggestions(limit = 100): Promise<{
    items: Array<{
      id: string;
      source: string;
      body: string;
      contact: string | null;
      userId: string | null;
      createdAt: string;
    }>;
    total: number;
    sheetsConfigured: boolean;
  }> {
    const take = clampLimit(limit);
    const [items, total] = await Promise.all([
      this.prisma.gamesLaunchSuggestion.findMany({
        orderBy: { createdAt: "desc" },
        take
      }),
      this.prisma.gamesLaunchSuggestion.count()
    ]);

    return {
      items: items.map((item) => ({
        body: item.body,
        contact: item.contact,
        createdAt: item.createdAt.toISOString(),
        id: item.id,
        source: item.source,
        userId: item.userId
      })),
      sheetsConfigured: this.sheets.isConfigured(),
      total
    };
  }

  getWaitlistMetrics(days: number) {
    return this.productAnalytics.getWaitlistMetrics(days);
  }

  async toggleDevNoteLike(input: {
    userId?: string;
    voterKey?: string;
  }): Promise<{ likeCount: number; liked: boolean }> {
    const voterKey = resolveVoterKey(input.userId, input.voterKey);

    if (!voterKey) {
      throw createAppException({
        code: AppErrorCode.ValidationError,
        message: "Voter key is required",
        statusCode: HttpStatus.BAD_REQUEST
      });
    }

    const existing = await this.prisma.gamesLaunchDevNoteLike.findUnique({
      where: { voterKey }
    });

    if (existing) {
      await this.prisma.gamesLaunchDevNoteLike.delete({
        where: { voterKey }
      });
    } else {
      await this.prisma.gamesLaunchDevNoteLike.create({
        data: {
          id: randomUUID(),
          voterKey
        }
      });
    }

    this.invalidateStatusCache();
    const likeCount = await this.prisma.gamesLaunchDevNoteLike.count();

    return {
      likeCount,
      liked: !existing
    };
  }

  private invalidateStatusCache(): void {
    this.statusCache = null;
  }

  private async hasDevNoteLike(voterKey: string): Promise<boolean> {
    const row = await this.prisma.gamesLaunchDevNoteLike.findUnique({
      select: { id: true },
      where: { voterKey }
    });
    return Boolean(row);
  }

  private async loadStatus(): Promise<CachedLaunchStatus> {
    try {
      const [row, waitingCount, averageMmr, devNoteLikeCount] = await Promise.all([
        this.prisma.gamesLaunchSetting.findUnique({
          where: { id: GAMES_LAUNCH_SETTING_ID }
        }),
        this.loadWaitingCount(),
        this.loadAverageMmr(),
        this.prisma.gamesLaunchDevNoteLike.count()
      ]);

      return {
        averageMmr,
        communityOpen: row?.communityOpen ?? false,
        devNoteLikeCount,
        launchAt: GAMES_LAUNCH_AT_ISO,
        searchLive: row?.searchLive ?? false,
        waitingCount
      };
    } catch {
      return {
        averageMmr: null,
        communityOpen: false,
        devNoteLikeCount: 0,
        launchAt: GAMES_LAUNCH_AT_ISO,
        searchLive: false,
        waitingCount: 0
      };
    }
  }

  /**
   * Counter = Telegram channel subscribers + applications via Discord/email/VK/other.
   * Telegram interests are excluded when subscriber count is available (no double-count).
   */
  private async loadWaitingCount(): Promise<number> {
    const [telegramSubscribers, altApplications, totalInterests] = await Promise.all([
      this.loadTelegramSubscriberCount(),
      this.prisma.gamesLaunchInterest.count({
        where: { channel: { not: "telegram" } }
      }),
      this.prisma.gamesLaunchInterest.count()
    ]);

    if (telegramSubscribers === null) {
      return totalInterests;
    }

    return telegramSubscribers + altApplications;
  }

  private async loadTelegramSubscriberCount(): Promise<number | null> {
    const token = process.env["WAITLIST_BOT_TOKEN"]?.trim() ?? "";
    const channelUrl =
      process.env["WAITLIST_CHANNEL_URL"]?.trim() || "https://t.me/opinia_official";

    if (!token || token.startsWith("change_me")) {
      return null;
    }

    const chatId = resolveTelegramChatId(channelUrl);

    if (!chatId) {
      return null;
    }

    try {
      const url = new URL(`https://api.telegram.org/bot${token}/getChatMemberCount`);
      url.searchParams.set("chat_id", chatId);

      const response = await fetch(url, {
        signal: AbortSignal.timeout(4_000)
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        ok?: boolean;
        result?: number;
      };

      if (!payload.ok || typeof payload.result !== "number" || !Number.isFinite(payload.result)) {
        return null;
      }

      return Math.max(0, Math.trunc(payload.result));
    } catch {
      return null;
    }
  }

  private async loadAverageMmr(): Promise<string | null> {
    const interestUsers = await this.prisma.gamesLaunchInterest.findMany({
      distinct: ["userId"],
      select: { userId: true },
      where: { userId: { not: null } }
    });

    const waitlistUserIds = interestUsers
      .map((row) => row.userId)
      .filter((id): id is string => Boolean(id));

    if (waitlistUserIds.length === 0) {
      return null;
    }

    const mmrRows = await this.prisma.entityAttribute.findMany({
      select: { value: true },
      where: {
        key: DOTA_ATTRIBUTE_KEYS.mmr,
        entity: {
          ownerUserId: { in: waitlistUserIds },
          attributes: {
            some: {
              key: DOTA_ATTRIBUTE_KEYS.vertical,
              value: DOTA_VERTICAL
            }
          }
        }
      }
    });

    return averageDotaMmr(mmrRows.map((row) => row.value));
  }
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 100;
  }

  return Math.min(200, Math.max(1, Math.trunc(limit)));
}

function resolveVoterKey(userId?: string, voterKey?: string): string | null {
  if (userId?.trim()) {
    return `user:${userId.trim()}`;
  }

  const trimmed = voterKey?.trim();
  return trimmed ? `visitor:${trimmed}` : null;
}

function resolveTelegramChatId(channelUrl: string): string | null {
  try {
    const url = new URL(channelUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const handle = parts[0]?.replace(/^@/, "").trim() ?? "";

    if (!handle || handle.startsWith("+") || handle.includes("joinchat")) {
      return null;
    }

    return `@${handle}`;
  } catch {
    const trimmed = channelUrl.trim().replace(/^@/, "");
    return trimmed ? `@${trimmed}` : null;
  }
}

function averageDotaMmr(values: Array<string | null | undefined>): string | null {
  const numbers: number[] = [];

  for (const value of values) {
    if (!value?.trim()) {
      continue;
    }

    if (value.includes("-")) {
      const [fromRaw = "", toRaw = ""] = value.split("-");
      const from = Number.parseInt(fromRaw.trim(), 10);
      const to = Number.parseInt(toRaw.trim(), 10);

      if (Number.isFinite(from) && Number.isFinite(to)) {
        numbers.push((from + to) / 2);
      }

      continue;
    }

    const parsed = Number.parseInt(value.trim(), 10);

    if (Number.isFinite(parsed)) {
      numbers.push(parsed);
    }
  }

  if (numbers.length === 0) {
    return null;
  }

  return String(Math.round(numbers.reduce((sum, item) => sum + item, 0) / numbers.length));
}
