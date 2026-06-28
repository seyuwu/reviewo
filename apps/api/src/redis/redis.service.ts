import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type RedisClientType } from "redis";

import type { EnvironmentVariables } from "../config/environment.validation.js";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: RedisClientType;
  private connectPromise: Promise<void> | null = null;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    const redisUrl = configService.get("REDIS_URL", { infer: true });
    this.client = createClient({ url: redisUrl });
    this.client.on("error", () => undefined);
  }

  async getClient(): Promise<RedisClientType> {
    if (!this.client.isOpen) {
      this.connectPromise ??= this.client.connect().then(() => undefined);
      await this.connectPromise;
    }

    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
