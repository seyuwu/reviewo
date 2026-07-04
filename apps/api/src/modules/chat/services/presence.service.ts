import { Injectable } from "@nestjs/common";
import {
  buildEntityChatPresenceKey,
  normalizeEntityChatLocale,
  type EntityChatLocale
} from "@reviewo/shared";

import { RedisService } from "../../../redis/redis.service.js";

const PRESENCE_TTL_SECONDS = 90;

@Injectable()
export class PresenceService {
  constructor(private readonly redisService: RedisService) {}

  entityOnlineKey(entityId: string, locale: EntityChatLocale = "ru"): string {
    return buildEntityChatPresenceKey(entityId, locale);
  }

  async markOnline(entityId: string, userId: string, locale?: EntityChatLocale): Promise<number> {
    const client = await this.redisService.getClient();
    const key = this.entityOnlineKey(entityId, normalizeEntityChatLocale(locale));
    const now = Date.now();

    await client.zAdd(key, [{ score: now, value: userId }]);
    await client.zRemRangeByScore(key, 0, now - PRESENCE_TTL_SECONDS * 1000);

    return client.zCard(key);
  }

  async refreshOnline(entityId: string, userId: string, locale?: EntityChatLocale): Promise<number> {
    return this.markOnline(entityId, userId, locale);
  }

  async markOffline(entityId: string, userId: string, locale?: EntityChatLocale): Promise<number> {
    const client = await this.redisService.getClient();
    const key = this.entityOnlineKey(entityId, normalizeEntityChatLocale(locale));

    await client.zRem(key, userId);
    await client.zRemRangeByScore(key, 0, Date.now() - PRESENCE_TTL_SECONDS * 1000);

    return client.zCard(key);
  }

  async getOnlineCount(entityId: string, locale?: EntityChatLocale): Promise<number> {
    const client = await this.redisService.getClient();
    const key = this.entityOnlineKey(entityId, normalizeEntityChatLocale(locale));
    const now = Date.now();

    await client.zRemRangeByScore(key, 0, now - PRESENCE_TTL_SECONDS * 1000);

    return client.zCard(key);
  }
}
