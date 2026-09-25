import { createHash } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { RedisClientType } from "redis";

import { AppErrorCode } from "../exceptions/app-error-code.js";
import { createAppException } from "../exceptions/app.exception.js";
import { RedisService } from "../../redis/redis.service.js";

export interface RateLimitRule {
  key: string;
  limit: number;
  message: string;
  namespace: string;
  windowSeconds: number;
}

export interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
}

/**
 * Atomic INCR + first-hit EXPIRE. Doing this server-side in one script keeps the
 * window TTL correct even if the process dies between the counter and the expiry.
 */
const INCR_WITH_TTL_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

@Injectable()
export class ApiRateLimiterService {
  constructor(private readonly redisService: RedisService) {}

  async assertWithinLimits(rules: RateLimitRule[]): Promise<void> {
    for (const rule of rules) {
      await this.assertWithinLimit(rule);
    }
  }

  async checkWithinLimits(rules: RateLimitRule[]): Promise<void> {
    for (const rule of rules) {
      await this.checkWithinLimit(rule);
    }
  }

  async recordLimits(rules: RateLimitRule[]): Promise<void> {
    for (const rule of rules) {
      await this.recordLimit(rule);
    }
  }

  private async assertWithinLimit(rule: RateLimitRule): Promise<void> {
    const client = await this.redisService.getClient();
    const redisKey = buildRateLimitRedisKey(rule);
    const count = await this.incrementWithTtl(client, redisKey, rule.windowSeconds);

    if (count <= rule.limit) {
      return;
    }

    throw await createRateLimitException(rule, redisKey, client);
  }

  private async checkWithinLimit(rule: RateLimitRule): Promise<void> {
    const client = await this.redisService.getClient();
    const redisKey = buildRateLimitRedisKey(rule);
    const rawCount = await client.get(redisKey);
    const count = rawCount ? Number(rawCount) : 0;

    if (count < rule.limit) {
      return;
    }

    throw await createRateLimitException(rule, redisKey, client);
  }

  private async recordLimit(rule: RateLimitRule): Promise<void> {
    const client = await this.redisService.getClient();
    const redisKey = buildRateLimitRedisKey(rule);

    await this.incrementWithTtl(client, redisKey, rule.windowSeconds);
  }

  private async incrementWithTtl(
    client: Pick<RedisClientType, "eval">,
    redisKey: string,
    windowSeconds: number
  ): Promise<number> {
    const result = await client.eval(INCR_WITH_TTL_SCRIPT, {
      arguments: [String(windowSeconds)],
      keys: [redisKey]
    });

    return Number(result);
  }
}

export function resolveRequestIp(request: RequestLike): string {
  return request.ip || request.socket?.remoteAddress || "unknown";
}

function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function buildRateLimitRedisKey(rule: RateLimitRule): string {
  return `api:rate:${rule.namespace}:${hashRateLimitKey(rule.key)}`;
}

async function createRateLimitException(
  rule: RateLimitRule,
  redisKey: string,
  client: { ttl: (key: string) => Promise<number> }
) {
  const retryAfterSeconds = Math.max(await client.ttl(redisKey), 1);

  return createAppException({
    code: AppErrorCode.TooManyRequests,
    details: {
      retryAfterSeconds
    },
    message: rule.message,
    statusCode: HttpStatus.TOO_MANY_REQUESTS
  });
}
