import { createHash } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";

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

@Injectable()
export class ApiRateLimiterService {
  constructor(private readonly redisService: RedisService) {}

  async assertWithinLimits(rules: RateLimitRule[]): Promise<void> {
    for (const rule of rules) {
      await this.assertWithinLimit(rule);
    }
  }

  private async assertWithinLimit(rule: RateLimitRule): Promise<void> {
    const client = await this.redisService.getClient();
    const redisKey = `api:rate:${rule.namespace}:${hashRateLimitKey(rule.key)}`;
    const count = await client.incr(redisKey);

    if (count === 1) {
      await client.expire(redisKey, rule.windowSeconds);
    }

    if (count <= rule.limit) {
      return;
    }

    const retryAfterSeconds = Math.max(await client.ttl(redisKey), 1);

    throw createAppException({
      code: AppErrorCode.TooManyRequests,
      details: {
        retryAfterSeconds
      },
      message: rule.message,
      statusCode: HttpStatus.TOO_MANY_REQUESTS
    });
  }
}

export function resolveRequestIp(request: RequestLike): string {
  return request.ip || request.socket?.remoteAddress || "unknown";
}

function hashRateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
