import {
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { EnvironmentVariables } from "../../config/environment.validation.js";
import { PrismaService } from "../../database/prisma.service.js";
import { RedisService } from "../../redis/redis.service.js";
import { AuthService } from "../auth/services/auth.service.js";
import type { PartyNotificationPayload } from "../social/party-realtime.types.js";
import { verifyTelegramLoginPayload, type TelegramLoginPayload } from "./telegram-login.js";

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService
  ) {}

  async completeLink(code: string, telegramUserId: string) {
    return this.authService.completeTelegramLink({ code, telegramUserId });
  }

  async ensureTelegramIdentity(
    userId: string,
    telegramUserId: string,
    telegramUsername?: string | null
  ): Promise<{ linked: true }> {
    await this.prismaService.$transaction(async (transaction) => {
      const identityForTelegram = await transaction.userAuthIdentity.findUnique({
        where: {
          provider_providerUserId: {
            provider: "telegram",
            providerUserId: telegramUserId
          }
        }
      });
      if (identityForTelegram && identityForTelegram.userId !== userId) {
        throw new ConflictException("This Telegram account is linked to another Opinia account");
      }

      const identityForUser = await transaction.userAuthIdentity.findFirst({
        where: { provider: "telegram", userId }
      });
      if (identityForUser && identityForUser.providerUserId !== telegramUserId) {
        throw new ConflictException("This Opinia account is linked to another Telegram account");
      }

      if (!identityForTelegram) {
        await transaction.userAuthIdentity.create({
          data: {
            passwordHash: null,
            provider: "telegram",
            providerUserId: telegramUserId,
            ...(telegramUsername !== undefined ? { telegramUsername } : {}),
            userId
          }
        });
      } else if (
        telegramUsername !== undefined &&
        identityForTelegram.telegramUsername !== telegramUsername
      ) {
        await transaction.userAuthIdentity.update({
          where: { id: identityForTelegram.id },
          data: { telegramUsername }
        });
      }
    });

    return { linked: true };
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

    const telegramUsername =
      payload.username && /^[a-zA-Z0-9_]{1,32}$/.test(payload.username) ? payload.username : null;
    if (identity.telegramUsername !== telegramUsername) {
      await this.prismaService.userAuthIdentity.update({
        where: { id: identity.id },
        data: { telegramUsername }
      });
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
      this.logger.warn("Skipped a party notification because the account has no Telegram identity");
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
      this.logger.warn(
        "Skipped a party roster notification because the account has no Telegram identity"
      );
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

  async enqueueSitePartyMatchNotification(
    userId: string,
    input: {
      activity: "solo_group" | "player_joined";
      clearSearch: boolean;
      eventKeySuffix: string;
      partyName: string;
      partySlug: string;
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
          eventKey: `site-match:${input.partySlug}:${input.eventKeySuffix}`,
          payload: { ...input, type: "site_party_match" },
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
    await this.prismaService.telegramBotNotification.updateMany({
      where: { eventKey: { startsWith: "tournament_dispute:" }, deliveredAt: null },
      data: { deliveredAt: now }
    });
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

    // Dispute alerts are handled only in the site's notification center. Cancel
    // any old queued Telegram alert so it cannot be sent after this rollout.
    const disputeRows = rows.filter((row) => isTournamentDisputePayload(row.payload));
    if (disputeRows.length) {
      await this.prismaService.telegramBotNotification.updateMany({
        where: { id: { in: disputeRows.map((row) => row.id) }, deliveredAt: null },
        data: { deliveredAt: now }
      });
    }
    const deliverableRows = rows.filter((row) => !isTournamentDisputePayload(row.payload));
    const staleIds = new Set<string>();
    const mentionRows = deliverableRows.filter((row) => isMatchMentionPayload(row.payload));
    if (mentionRows.length) {
      const [notices, identities] = await Promise.all([
        this.prismaService.dotaTournamentMatchChatMention.findMany({
          where: { id: { in: mentionRows.map((row) => (row.payload as { mentionId: string }).mentionId) }, readAt: null },
          include: { message: { include: { match: { include: {
            tournament: true,
            entryA: { select: { members: { where: { isActive: true, roomLeftAt: null }, select: { userId: true } } } },
            entryB: { select: { members: { where: { isActive: true, roomLeftAt: null }, select: { userId: true } } } }
          } } } } }
        }),
        this.prismaService.userAuthIdentity.findMany({
          where: { provider: "telegram", providerUserId: { in: mentionRows.map((row) => row.telegramUserId) }, user: { status: "active" } },
          select: { providerUserId: true, user: { select: { id: true, role: true } } }
        })
      ]);
      const noticeMap = new Map(notices.map((notice) => [notice.id, notice]));
      const identityMap = new Map(identities.map((identity) => [identity.providerUserId, identity.user]));
      for (const row of mentionRows) {
        const notice = noticeMap.get((row.payload as { mentionId: string }).mentionId);
        const user = identityMap.get(row.telegramUserId);
        const match = notice?.message.match;
        const organizer = user && (user.role === "ADMIN" || user.role === "TOURNAMENT_MODERATOR");
        const expired = match && ["COMPLETED", "CANCELLED"].includes(match.tournament.status) &&
          (match.tournament.finishedAt ?? match.tournament.updatedAt).getTime() + 12 * 60 * 60_000 <= now.getTime();
        if (!notice || !user || user.id !== notice.targetUserId || !match || expired ||
          (!organizer && (match.tournament.status === "DRAFT" || ![...match.entryA.members, ...match.entryB.members].some((member) => member.userId === user.id))))
          staleIds.add(row.id);
      }
      await this.prismaService.telegramBotNotification.updateMany({
        where: { id: { in: [...staleIds] }, deliveredAt: null }, data: { deliveredAt: now }
      });
    }
    const eligibleRows = deliverableRows.filter((row) => !staleIds.has(row.id));
    for (const row of eligibleRows) {
      await this.prismaService.telegramBotNotification.updateMany({
        data: {
          attempts: { increment: 1 },
          nextAttemptAt: new Date(now.getTime() + 60_000)
        },
        where: { deliveredAt: null, id: row.id, nextAttemptAt: { lte: now } }
      });
    }

    return eligibleRows.map(({ id, payload, telegramUserId }) => ({ id, payload, telegramUserId }));
  }

  async recordDelivery(id: string, telegramUserId: string, delivered: boolean): Promise<void> {
    const notification = await this.prismaService.telegramBotNotification.findFirst({
      select: { attempts: true },
      where: { deliveredAt: null, id, telegramUserId }
    });

    if (!notification) return;

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

  assertBotSecret(provided?: string): void {
    const expected = this.getBotSecret();
    if (!expected) {
      throw new UnauthorizedException();
    }

    const left = Buffer.from(provided ?? "");
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException();
    }
  }

  getUnavailableStatus(): typeof HttpStatus.SERVICE_UNAVAILABLE {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
}

function isTournamentDisputePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const item = payload as Record<string, unknown>;
  return item.type === "tournament_dispute" && typeof item.matchId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.matchId) &&
    typeof item.disputeNotifiedAt === "string";
}

function isMatchMentionPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const item = payload as Record<string, unknown>;
  return item.type === "tournament_match_mention" && typeof item.mentionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.mentionId);
}
