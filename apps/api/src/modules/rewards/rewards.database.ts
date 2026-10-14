import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import type { EnvironmentVariables } from "../../config/environment.validation.js";

@Injectable()
export class RewardsDatabase extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get("DATABASE_URL", { infer: true }),
        options: "-c timezone=UTC -c statement_timeout=5000",
        max: 3,
        application_name: "fdp_rewards_api",
        connectionTimeoutMillis: 2000,
        idleTimeoutMillis: 10000
      })
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Injectable()
export class RewardsAnalyticsDatabase extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get("DATABASE_URL", { infer: true }),
        options: "-c timezone=UTC -c statement_timeout=3000",
        max: 1,
        application_name: "fdp_rewards_analytics",
        connectionTimeoutMillis: 2000,
        idleTimeoutMillis: 10000
      })
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
