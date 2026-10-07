import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import type { EnvironmentVariables } from "../../config/environment.validation.js";
import { PrismaService } from "../../database/prisma.service.js";
import { RedisService } from "../../redis/redis.service.js";
import { AuthService } from "../auth/services/auth.service.js";
import { TelegramTournamentBotService } from "./telegram-tournament-bot.service.js";
import { verifyTelegramOidcToken, type TelegramOidcKey } from "./telegram-oidc-token.js";

type LoginIntent = "login" | "link";
type LoginRequest = {
  intent: LoginIntent;
  userId: string | null;
  browserHash: string;
  nonce: string;
  createdAt: number;
};
const TTL_SECONDS = 300;
const consumeScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local req = cjson.decode(raw)
if req.browserHash ~= ARGV[1] or req.intent ~= ARGV[2] then return 0 end
if req.intent == 'link' and req.userId ~= ARGV[3] then return 0 end
redis.call('DEL', KEYS[1])
return 1`;
const releaseLockScript = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

@Injectable()
export class TelegramOfficialLoginService {
  private keys: TelegramOidcKey[] = [];
  private keysFetchedAt = 0;
  private fetchingKeys: Promise<TelegramOidcKey[]> | null = null;

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly linking: TelegramTournamentBotService
  ) {}

  configuration() {
    return { enabled: Boolean(this.config.get("TELEGRAM_LOGIN_CLIENT_ID", { infer: true })) };
  }

  private clientId() {
    const value = this.config.get("TELEGRAM_LOGIN_CLIENT_ID", { infer: true });
    if (!value) throw new ServiceUnavailableException("Official Telegram Login is not configured");
    return value;
  }
  private key(id: string) {
    return `auth:telegram-official-login:${id}`;
  }
  private invalid(): never {
    throw new UnauthorizedException({
      code: "TELEGRAM_AUTH_INVALID",
      message: "Telegram confirmation is invalid or expired"
    });
  }

  async create(intent: LoginIntent, user?: AuthenticatedUser) {
    const clientId = this.clientId();
    if (intent === "link" && (!user || user.status !== "active")) this.invalid();
    const requestId = randomBytes(16).toString("hex");
    const browserToken = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const request: LoginRequest = {
      intent,
      userId: user?.id ?? null,
      browserHash: createHash("sha256").update(browserToken).digest("hex"),
      nonce,
      createdAt: Math.floor(Date.now() / 1000)
    };
    const client = await this.redis.getClient();
    if (
      (await client.set(this.key(requestId), JSON.stringify(request), {
        EX: TTL_SECONDS,
        NX: true
      })) !== "OK"
    )
      this.invalid();
    return { requestId, browserToken, nonce, clientId: Number(clientId), expiresIn: TTL_SECONDS };
  }

  async complete(
    input: { requestId: string; browserToken: string; idToken: string },
    intent: LoginIntent,
    user?: AuthenticatedUser
  ) {
    const clientId = this.clientId();
    const client = await this.redis.getClient();
    const raw = await client.get(this.key(input.requestId));
    if (!raw) this.invalid();
    const request = JSON.parse(raw) as LoginRequest;
    const browserHash = createHash("sha256").update(input.browserToken).digest("hex");
    if (
      request.intent !== intent ||
      request.browserHash !== browserHash ||
      (intent === "link" && (!user || user.status !== "active" || request.userId !== user.id))
    )
      this.invalid();
    const keys = await this.getKeys();
    let identity: ReturnType<typeof verifyTelegramOidcToken>;
    try {
      identity = verifyTelegramOidcToken(input.idToken, { ...request, clientId }, keys);
    } catch {
      this.invalid();
    }
    const consumed = await client.eval(consumeScript, {
      keys: [this.key(input.requestId)],
      arguments: [browserHash, intent, user?.id ?? ""]
    });
    if (consumed !== 1) this.invalid();

    if (intent === "link" && user) {
      await this.connect(user, identity.id, identity.username);
      return { linked: true as const };
    }
    const linked = await this.prisma.userAuthIdentity.findUnique({
      where: { provider_providerUserId: { provider: "telegram", providerUserId: identity.id } },
      include: { user: true }
    });
    if (!linked || linked.user.status !== "active")
      throw new UnauthorizedException({
        code: "TELEGRAM_NOT_LINKED",
        message: "Register in FDP or connect Telegram from your existing website account first"
      });
    await this.prisma.userAuthIdentity.update({
      where: { id: linked.id },
      data: { telegramUsername: identity.username }
    });
    return this.auth.createAuthResponse(linked.user);
  }

  private async connect(user: AuthenticatedUser, id: string, username: string | null) {
    const client = await this.redis.getClient();
    const lockToken = randomBytes(16).toString("hex");
    const lockKeys = [
      `auth:telegram-link-lock:user:${user.id}`,
      `auth:telegram-link-lock:telegram:${id}`
    ].sort();
    const acquired: string[] = [];
    try {
      for (const key of lockKeys) {
        if ((await client.set(key, lockToken, { EX: 30, NX: true })) !== "OK")
          throw new ConflictException("A Telegram link is already being processed");
        acquired.push(key);
      }
      const [byTelegram, byUser] = await Promise.all([
        this.prisma.userAuthIdentity.findUnique({
          where: { provider_providerUserId: { provider: "telegram", providerUserId: id } }
        }),
        this.prisma.userAuthIdentity.findFirst({ where: { provider: "telegram", userId: user.id } })
      ]);
      if ((byTelegram && byTelegram.userId !== user.id) || (byUser && byUser.providerUserId !== id))
        throw new ConflictException("Telegram or website account is already linked elsewhere");
      // A signed identity alone does not prove that the bot is allowed to contact this user.
      await this.checkBotAccess(id);
      await this.linking.linkVerifiedIdentity(user.id, id, username);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error.code === "P2002" || error.code === "P2034")
      )
        throw new ConflictException("Telegram or website account is already linked elsewhere");
      throw error;
    } finally {
      for (const key of acquired)
        await client.eval(releaseLockScript, { keys: [key], arguments: [lockToken] });
    }
  }

  private async checkBotAccess(id: string) {
    const token = this.config.get("DOTA_BOT_TOKEN", { infer: true });
    if (!token) throw new ServiceUnavailableException("Telegram bot is not configured");
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: id, action: "typing" }),
        signal: AbortSignal.timeout(5000),
        redirect: "error"
      });
    } catch {
      throw new ServiceUnavailableException("Could not contact Telegram");
    }
    if (response.status === 400 || response.status === 403)
      throw new ForbiddenException({
        code: "TELEGRAM_BOT_ACCESS_REQUIRED",
        message: "Allow FDP to send messages or start the bot first"
      });
    if (!response.ok) throw new ServiceUnavailableException("Could not contact Telegram");
    const result = (await response.json()) as { ok?: boolean; result?: boolean };
    if (!result.ok || result.result !== true)
      throw new ServiceUnavailableException("Could not confirm bot access");
  }

  private async getKeys(): Promise<TelegramOidcKey[]> {
    if (this.keys.length && Date.now() - this.keysFetchedAt < 60_000) return this.keys;
    // Refresh once per minute: supports Telegram key rotation without trusting token-provided URLs.
    this.fetchingKeys ??= (async () => {
      try {
        const response = await fetch("https://oauth.telegram.org/.well-known/jwks.json", {
          signal: AbortSignal.timeout(5000),
          redirect: "error"
        });
        if (!response.ok) throw new Error("JWKS unavailable");
        const body = await response.text();
        if (body.length > 65536) throw new Error("JWKS too large");
        const data = JSON.parse(body) as { keys?: TelegramOidcKey[] };
        if (!Array.isArray(data.keys) || !data.keys.length || data.keys.length > 20)
          throw new Error("Invalid JWKS");
        this.keys = data.keys;
        this.keysFetchedAt = Date.now();
        return this.keys;
      } catch {
        throw new ServiceUnavailableException("Telegram verification is temporarily unavailable");
      } finally {
        this.fetchingKeys = null;
      }
    })();
    return this.fetchingKeys;
  }
}
