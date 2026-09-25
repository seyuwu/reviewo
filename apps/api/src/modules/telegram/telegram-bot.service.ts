import { HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";
import type { EnvironmentVariables } from "../../config/environment.validation.js";
import { PrismaService } from "../../database/prisma.service.js";
import { RedisService } from "../../redis/redis.service.js";
import { AuthService } from "../auth/services/auth.service.js";
import type { PartyNotificationPayload } from "../social/party-realtime.types.js";
import { verifyTelegramLoginPayload, type TelegramLoginPayload } from "./telegram-login.js";

@Injectable()
export class TelegramBotService {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService
  ) {}

  async completeLink(code: string, telegramUserId: string) {
    return this.authService.completeTelegramLink({ code, telegramUserId });
  }

  async loginFromTelegram(payload: TelegramLoginPayload) {
    const botToken = this.configService.get("DOTA_BOT_TOKEN", { infer: true });
    if (!botToken || !verifyTelegramLoginPayload(payload, botToken)) {
      throw new UnauthorizedException("Telegram authorization is invalid or expired");
    }

    const redis = await this.redisService.getClient();
    const replayKey = `auth:telegram-login:${createHash("sha256").update(payload.hash).digest("hex")}`;
    const firstUse = await redis.set(replayKey, "1", { EX: 5 * 60, NX: true });
    if (firstUse !== "OK") {
      throw new UnauthorizedException("Telegram authorization was already used");
    }

    const identity = await this.prismaService.userAuthIdentity.findUnique({
      include: { user: true },
      where: { provider_providerUserId: { provider: "telegram", providerUserId: payload.id } }
    });
    if (!identity || identity.user.status !== "active") {
      throw new UnauthorizedException("Link your Telegram account to Opinia before continuing");
    }

    return this.authService.createAuthResponse({
      avatarUrl: identity.user.avatarUrl,
      displayName: identity.user.displayName,
      email: identity.user.email,
      id: identity.user.id,
      role: identity.user.role,
      status: identity.user.status,
      username: identity.user.username
    });
  }

  async createWebAccessTicket(userId: string): Promise<{ ticket: string; expiresIn: number }> {
    const ticket = randomBytes(32).toString("base64url");
    const redis = await this.redisService.getClient();
    const stored = await redis.set(this.webAccessTicketKey(ticket), userId, {
      EX: 10 * 60,
      NX: true
    });
    if (stored !== "OK") {
      throw new UnauthorizedException("Could not create Telegram web access ticket");
    }
    return { ticket, expiresIn: 10 * 60 };
  }

  async exchangeWebAccessTicket(ticket: string) {
    const redis = await this.redisService.getClient();
    const userId = await redis.getDel(this.webAccessTicketKey(ticket));
    if (!userId) {
      throw new UnauthorizedException("Telegram web access link is invalid or expired");
    }

    const user = await this.prismaService.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Telegram web access link is invalid or expired");
    }

    return this.authService.createAuthResponse({
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      role: user.role,
      status: user.status,
      username: user.username
    });
  }

  private webAccessTicketKey(ticket: string): string {
    const digest = createHash("sha256").update(ticket).digest("hex");
    return `auth:telegram-web-access:${digest}`;
  }

  async enqueuePartyNotification(userId: string, payload: PartyNotificationPayload): Promise<void> {
    const identity = await this.prismaService.userAuthIdentity.findFirst({
      select: { providerUserId: true },
      where: { provider: "telegram", userId }
    });

    if (!identity) {
      return;
    }

    await this.prismaService.telegramBotNotification.createMany({
      data: [
        {
          eventKey: `${payload.type}:${payload.invite.id}`,
          payload: payload as object,
          telegramUserId: identity.providerUserId
        }
      ],
      skipDuplicates: true
    });
  }

  async enqueuePartyRosterNotification(
    userId: string,
    partySlug: string,
    eventId: string,
    activity?: {
      type: "member_left" | "member_kicked";
      memberDisplayName: string;
      partyName: string;
    }
  ): Promise<void> {
    const identity = await this.prismaService.userAuthIdentity.findFirst({
      select: { providerUserId: true },
      where: { provider: "telegram", userId }
    });

    if (!identity) {
      return;
    }

    await this.prismaService.telegramBotNotification.createMany({
      data: [
        {
          eventKey: `${activity?.type ?? "party_updated"}:${partySlug}:${eventId}`,
          payload: activity
            ? { ...activity, partySlug, type: activity.type }
            : { partySlug, type: "party_updated" },
          telegramUserId: identity.providerUserId
        }
      ],
      skipDuplicates: true
    });
  }

  async listNotifications(): Promise<
    Array<{ id: string; telegramUserId: string; payload: unknown }>
  > {
    const now = new Date();
    const linkedAccounts = await this.prismaService.userAuthIdentity.findMany({
      select: { providerUserId: true },
      where: { provider: "telegram" }
    });
    if (linkedAccounts.length === 0) {
      return [];
    }
    const rows = await this.prismaService.telegramBotNotification.findMany({
      orderBy: { createdAt: "asc" },
      select: { attempts: true, id: true, payload: true, telegramUserId: true },
      take: 50,
      where: {
        attempts: { lt: 8 },
        deliveredAt: null,
        nextAttemptAt: { lte: now },
        telegramUserId: { in: linkedAccounts.map((account) => account.providerUserId) }
      }
    });

    for (const row of rows) {
      await this.prismaService.telegramBotNotification.updateMany({
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(now.getTime() + 60_000)
        },
        where: { deliveredAt: null, id: row.id, nextAttemptAt: { lte: now } }
      });
    }

    return rows.map(({ id, payload, telegramUserId }) => ({ id, payload, telegramUserId }));
  }

  async recordDelivery(id: string, telegramUserId: string, delivered: boolean): Promise<void> {
    const notification = await this.prismaService.telegramBotNotification.findFirst({
      select: { attempts: true },
      where: { deliveredAt: null, id, telegramUserId }
    });

    if (!notification) {
      return;
    }

    if (delivered) {
      await this.prismaService.telegramBotNotification.updateMany({
        data: { deliveredAt: new Date() },
        where: { deliveredAt: null, id, telegramUserId }
      });
      return;
    }

    const retrySeconds = Math.min(5 * 2 ** Math.max(0, notification.attempts - 1), 300);
    await this.prismaService.telegramBotNotification.updateMany({
      data: { nextAttemptAt: new Date(Date.now() + retrySeconds * 1000) },
      where: { deliveredAt: null, id, telegramUserId }
    });
  }

  getBotSecret(): string | undefined {
    return this.configService.get("TELEGRAM_BOT_API_SECRET", { infer: true });
  }

  getUnavailableStatus(): typeof HttpStatus.SERVICE_UNAVAILABLE {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
}
