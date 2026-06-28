import { HttpStatus, Injectable } from "@nestjs/common";

import { AppErrorCode } from "../../../common/exceptions/app-error-code.js";
import { createAppException } from "../../../common/exceptions/app.exception.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { RedisService } from "../../../redis/redis.service.js";

const DEFAULT_TRUST_SCORE = 0.5;

@Injectable()
export class ChatRateLimiterService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService
  ) {}

  async assertCanSendMessage(userId: string): Promise<void> {
    const trustScore = await this.resolveUserTrustScore(userId);
    const cooldownSeconds = resolveCooldownSeconds(trustScore);
    const client = await this.redisService.getClient();
    const key = `chat:rate:${userId}`;
    const existing = await client.get(key);

    if (existing) {
      const retryAfterSeconds = Math.max(await client.ttl(key), 1);

      throw createAppException({
        code: AppErrorCode.TooManyRequests,
        details: {
          retryAfterSeconds
        },
        message: "Please wait before sending another chat message",
        statusCode: HttpStatus.TOO_MANY_REQUESTS
      });
    }

    await client.set(key, "1", {
      EX: cooldownSeconds
    });
  }

  private async resolveUserTrustScore(userId: string): Promise<number> {
    const profile = await this.prismaService.userTrustProfile.findUnique({
      select: {
        trustScore: true
      },
      where: {
        userId
      }
    });

    if (!profile) {
      return DEFAULT_TRUST_SCORE;
    }

    return Number(profile.trustScore);
  }
}

function resolveCooldownSeconds(trustScore: number): number {
  if (trustScore < 0.3) {
    return 30;
  }

  if (trustScore < 0.7) {
    return 10;
  }

  return 3;
}
