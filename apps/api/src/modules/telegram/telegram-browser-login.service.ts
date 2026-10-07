import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { AuthenticatedUser } from "../../common/interfaces/authenticated-request.js";
import { PrismaService } from "../../database/prisma.service.js";
import { RedisService } from "../../redis/redis.service.js";
import { AuthService } from "../auth/services/auth.service.js";
import { matchesTelegramVerificationCode } from "./telegram-verification-code.js";

const REQUEST_TTL_SECONDS = 5 * 60;
const confirmScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'expired' end
local request = cjson.decode(raw)
if request.userId and request.userId ~= ARGV[1] then return 'conflict' end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return 'expired' end
request.userId = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(request), 'EX', ttl)
return 'approved'`;
const pollScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'expired'} end
local request = cjson.decode(raw)
if request.pollHash ~= ARGV[1] then return {'expired'} end
if not request.userId then return {'pending'} end
redis.call('DEL', KEYS[1])
return {'approved', request.userId}`;

@Injectable()
export class TelegramBrowserLoginService {
  constructor(private readonly redis: RedisService, private readonly prisma: PrismaService,
    private readonly auth: AuthService) {}

  private key(requestId: string) { return `auth:telegram-browser-login:${requestId}`; }
  private expired(): never { throw new UnauthorizedException("Telegram login request expired; start again on the website"); }

  async create() {
    const client = await this.redis.getClient();
    const requestId = randomBytes(16).toString("hex");
    const pollToken = randomBytes(32).toString("base64url");
    const verificationCode = String(randomInt(100000, 1000000));
    const stored = await client.set(this.key(requestId), JSON.stringify({
      pollHash: createHash("sha256").update(pollToken).digest("hex"), verificationCode
    }), { EX: REQUEST_TTL_SECONDS, NX: true });
    if (stored !== "OK") this.expired();
    const configuredUsername = process.env["DOTA_BOT_USERNAME"];
    const username = configuredUsername && /^[a-zA-Z0-9_]{5,32}$/.test(configuredUsername)
      ? configuredUsername : "FDPdotabot";
    return { requestId, pollToken, verificationCode, expiresIn: REQUEST_TTL_SECONDS,
      botUrl: `https://t.me/${username}?start=web_login_${requestId}` };
  }

  async preview(requestId: string) {
    const client = await this.redis.getClient();
    const raw = await client.get(this.key(requestId));
    if (!raw) this.expired();
    return { valid: true as const };
  }

  async confirm(requestId: string, telegramUserId: string, verificationCode: string, user: AuthenticatedUser) {
    const client = await this.redis.getClient();
    const raw = await client.get(this.key(requestId));
    if (!raw) this.expired();
    const request = JSON.parse(raw) as { verificationCode: string };
    if (!matchesTelegramVerificationCode(request.verificationCode, verificationCode))
      throw new UnauthorizedException("Telegram login confirmation code is invalid");

    const identity = await this.prisma.userAuthIdentity.findUnique({
      where: { provider_providerUserId: { provider: "telegram", providerUserId: telegramUserId } },
      select: { userId: true }
    });
    if (user.status !== "active" || identity?.userId !== user.id)
      throw new UnauthorizedException("This Telegram account is not linked to your FDP account");
    const result = await client.eval(confirmScript, { keys: [this.key(requestId)], arguments: [user.id] });
    if (result !== "approved") this.expired();
    return { ok: true };
  }

  async poll(requestId: string, pollToken: string) {
    const client = await this.redis.getClient();
    const result = await client.eval(pollScript, { keys: [this.key(requestId)],
      arguments: [createHash("sha256").update(pollToken).digest("hex")] });
    if (!Array.isArray(result) || result[0] !== "approved" || typeof result[1] !== "string")
      return { status: Array.isArray(result) && result[0] === "pending" ? "pending" as const : "expired" as const };
    const user = await this.prisma.user.findUnique({ where: { id: result[1] } });
    if (!user || user.status !== "active") this.expired();
    return { status: "approved" as const, auth: await this.auth.createAuthResponse({
      id: user.id, displayName: user.displayName, email: user.email, role: user.role,
      status: user.status, username: user.username, avatarUrl: user.avatarUrl
    }) };
  }
}
