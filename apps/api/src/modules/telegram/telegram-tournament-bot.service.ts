import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { PrismaService } from "../../database/prisma.service.js";
import { RedisService } from "../../redis/redis.service.js";
import { AuthService } from "../auth/services/auth.service.js";

const LINK_TTL_SECONDS = 5 * 60;
const claimLinkScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'expired' end
local request = cjson.decode(raw)
if request.status == 'conflict' then return 'conflict' end
if request.telegramUserId and request.telegramUserId ~= ARGV[1] then return 'conflict' end
if request.status == 'approved' then return 'approved' end
if request.status ~= 'pending' and request.status ~= 'processing' then return 'expired' end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return 'expired' end
request.status = 'processing'
request.telegramUserId = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(request), 'EX', ttl)
return 'claimed'`;

const setLinkStatusScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'expired' end
local request = cjson.decode(raw)
if request.telegramUserId ~= ARGV[1] then return 'conflict' end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return 'expired' end
request.status = ARGV[2]
redis.call('SET', KEYS[1], cjson.encode(request), 'EX', ttl)
return 'ok'`;

const releaseLockScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

type BotLinkRequest = {
  status: "pending" | "processing" | "approved" | "conflict";
  telegramUserId?: string;
  userId: string;
};

@Injectable()
export class TelegramTournamentBotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auth: AuthService
  ) {}

  private key(requestId: string): string {
    return `auth:telegram-tournament-bot:${requestId}`;
  }

  async status(userId: string): Promise<{ botStarted: boolean; telegramLinked: boolean }> {
    const identity = await this.prisma.userAuthIdentity.findFirst({
      select: { providerUserId: true },
      where: { provider: "telegram", userId }
    });
    if (!identity) return { botStarted: false, telegramLinked: false };

    const started = await this.prisma.telegramBotStart.findUnique({
      select: { telegramUserId: true },
      where: { telegramUserId: identity.providerUserId }
    });
    return { botStarted: Boolean(started), telegramLinked: true };
  }

  async recordBotStarted(telegramUserId: string): Promise<void> {
    await this.prisma.telegramBotStart.upsert({
      create: { telegramUserId },
      update: { startedAt: new Date() },
      where: { telegramUserId }
    });
  }

  async createLinkRequest(user: AuthenticatedUser) {
    if (user.status !== "active") throw new UnauthorizedException("Account is not active");
    const current = await this.status(user.id);
    if (current.botStarted) return { botStarted: true as const };

    const requestId = randomBytes(16).toString("hex");
    const request: BotLinkRequest = { status: "pending", userId: user.id };
    const client = await this.redis.getClient();
    const stored = await client.set(this.key(requestId), JSON.stringify(request), {
      EX: LINK_TTL_SECONDS,
      NX: true
    });
    if (stored !== "OK") throw new UnauthorizedException("Could not start Telegram linking");

    const configuredUsername = process.env["DOTA_BOT_USERNAME"];
    const username = configuredUsername && /^[a-zA-Z0-9_]{5,32}$/.test(configuredUsername)
      ? configuredUsername
      : "FDPdotabot";
    return {
      botStarted: false as const,
      botUrl: `https://t.me/${username}?start=tournament_link_${requestId}`,
      expiresIn: LINK_TTL_SECONDS,
      requestId
    };
  }

  async poll(requestId: string, userId: string) {
    const client = await this.redis.getClient();
    const raw = await client.get(this.key(requestId));
    if (!raw) {
      const current = await this.status(userId);
      return current.botStarted ? { status: "approved" as const } : { status: "expired" as const };
    }
    const request = JSON.parse(raw) as BotLinkRequest;
    if (request.userId !== userId) throw new UnauthorizedException("Telegram link request not found");
    if (request.status === "approved") return { status: "approved" as const };
    if (request.status === "conflict") return { status: "conflict" as const };
    if (request.status === "processing") return { status: "pending" as const };
    return { status: "pending" as const };
  }

  async preview(requestId: string) {
    const client = await this.redis.getClient();
    const raw = await client.get(this.key(requestId));
    if (!raw) throw new UnauthorizedException("Telegram link request expired");
    const request = JSON.parse(raw) as BotLinkRequest;
    if (request.status === "conflict") throw new ConflictException("Telegram account is already linked elsewhere");
    const account = await this.prisma.user.findUnique({
      select: { displayName: true, status: true, username: true },
      where: { id: request.userId }
    });
    if (!account || account.status !== "active") throw new UnauthorizedException("Account is not active");
    return { valid: true as const, account: { displayName: account.displayName, username: account.username } };
  }

  async confirm(requestId: string, telegramUserId: string, telegramUsername?: string | null) {
    const client = await this.redis.getClient();
    const key = this.key(requestId);
    const raw = await client.get(key);
    if (!raw) throw new UnauthorizedException("Telegram link request expired");
    const initial = JSON.parse(raw) as BotLinkRequest;
    if (initial.status === "conflict") throw new ConflictException("Telegram account is already linked elsewhere");
    // A valid confirmation can only be sent by the bot after a real private-chat interaction.
    await this.recordBotStarted(telegramUserId);

    const lockToken = randomBytes(16).toString("hex");
    const lockKeys = [
      `auth:telegram-link-lock:user:${initial.userId}`,
      `auth:telegram-link-lock:telegram:${telegramUserId}`
    ].sort();
    const locked: string[] = [];
    try {
      for (const lockKey of lockKeys) {
        const acquired = await client.set(lockKey, lockToken, { EX: 30, NX: true });
        if (acquired !== "OK") throw new ConflictException("A Telegram link is already being processed");
        locked.push(lockKey);
      }

      const claim = await client.eval(claimLinkScript, { keys: [key], arguments: [telegramUserId] });
      if (claim === "expired") throw new UnauthorizedException("Telegram link request expired");
      if (claim === "conflict") {
        await this.setStatus(client, key, telegramUserId, "conflict");
        throw new ConflictException("Telegram account is already linked elsewhere");
      }
      if (claim !== "claimed" && claim !== "approved")
        throw new ConflictException("Telegram link is already being processed");

      let user: AuthenticatedUser;
      try {
        user = await this.linkIdentity(initial.userId, telegramUserId, telegramUsername);
      } catch (error) {
        if (error instanceof ConflictException) {
          await this.setStatus(client, key, telegramUserId, "conflict");
        }
        throw error;
      }
      const authResponse = await this.auth.createAuthResponse({
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        status: user.status,
        username: user.username,
        avatarUrl: user.avatarUrl
      });
      const marked = await this.setStatus(client, key, telegramUserId, "approved");
      if (!marked) throw new UnauthorizedException("Telegram link request expired");
      return authResponse;
    } finally {
      for (const lockKey of locked) {
        await client.eval(releaseLockScript, { keys: [lockKey], arguments: [lockToken] });
      }
    }
  }

  async loginBotSession(telegramUserId: string) {
    const identity = await this.prisma.userAuthIdentity.findUnique({
      where: { provider_providerUserId: { provider: "telegram", providerUserId: telegramUserId } },
      include: { user: true }
    });
    if (!identity || identity.user.status !== "active")
      throw new UnauthorizedException("This Telegram account is not linked to an Opinia account");
    return this.auth.createAuthResponse({
      id: identity.user.id,
      displayName: identity.user.displayName,
      email: identity.user.email,
      role: identity.user.role,
      status: identity.user.status,
      username: identity.user.username,
      avatarUrl: identity.user.avatarUrl
    });
  }

  private async linkIdentity(userId: string, telegramUserId: string, telegramUsername?: string | null) {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({ where: { id: userId } });
      if (!user || user.status !== "active") throw new UnauthorizedException("Account is not active");

      const byTelegram = await transaction.userAuthIdentity.findUnique({
        where: { provider_providerUserId: { provider: "telegram", providerUserId: telegramUserId } }
      });
      if (byTelegram && byTelegram.userId !== userId)
        throw new ConflictException("Telegram account is already linked to another Opinia account");

      const byUser = await transaction.userAuthIdentity.findFirst({
        where: { provider: "telegram", userId }
      });
      if (byUser && byUser.providerUserId !== telegramUserId)
        throw new ConflictException("This Opinia account is linked to another Telegram account");

      if (!byTelegram) {
        await transaction.userAuthIdentity.create({
          data: {
            passwordHash: null,
            provider: "telegram",
            providerUserId: telegramUserId,
            telegramUsername: telegramUsername ?? null,
            userId
          }
        });
      } else if (telegramUsername !== undefined && byTelegram.telegramUsername !== telegramUsername) {
        await transaction.userAuthIdentity.update({
          where: { id: byTelegram.id },
          data: { telegramUsername }
        });
      }
      return user;
    });
  }

  private async setStatus(client: Awaited<ReturnType<RedisService["getClient"]>>, key: string,
    telegramUserId: string, status: "approved" | "conflict"): Promise<boolean> {
    const result = await client.eval(setLinkStatusScript, {
      keys: [key],
      arguments: [telegramUserId, status]
    });
    return result === "ok";
  }
}
