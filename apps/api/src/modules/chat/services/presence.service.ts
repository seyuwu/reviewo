import { Injectable } from "@nestjs/common";

import { RedisService } from "../../../redis/redis.service.js";

const PRESENCE_TTL_SECONDS = 90;

@Injectable()
export class PresenceService {
  constructor(private readonly redisService: RedisService) {}

  entityOnlineKey(entityId: string): string {
    return `chat:entity:${entityId}:online`;
  }

  async markOnline(entityId: string, userId: string): Promise<number> {
    const client = await this.redisService.getClient();
    const key = this.entityOnlineKey(entityId);
    const now = Date.now();

    await client.zAdd(key, [{ score: now, value: userId }]);
    await client.zRemRangeByScore(key, 0, now - PRESENCE_TTL_SECONDS * 1000);

    return client.zCard(key);
  }

  async refreshOnline(entityId: string, userId: string): Promise<number> {
    return this.markOnline(entityId, userId);
  }

  async markOffline(entityId: string, userId: string): Promise<number> {
    const client = await this.redisService.getClient();
    const key = this.entityOnlineKey(entityId);

    await client.zRem(key, userId);
    await client.zRemRangeByScore(key, 0, Date.now() - PRESENCE_TTL_SECONDS * 1000);

    return client.zCard(key);
  }

  async getOnlineCount(entityId: string): Promise<number> {
    const client = await this.redisService.getClient();
    const key = this.entityOnlineKey(entityId);
    const now = Date.now();

    await client.zRemRangeByScore(key, 0, now - PRESENCE_TTL_SECONDS * 1000);

    return client.zCard(key);
  }
}
