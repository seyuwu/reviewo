import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "#prisma/client";
import type { PrismaService } from "../../database/prisma.service.js";
import type { EnvironmentVariables } from "../../config/environment.validation.js";
import { RewardsService } from "./rewards.service.js";
import { RewardVerificationService } from "./rewards.verification.js";

@Injectable()
export class RewardsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RewardsWorker.name);
  private timer?: NodeJS.Timeout;
  private active: Promise<void> | undefined;
  private database?: PrismaClient;
  private rewards?: RewardsService;
  private checks?: RewardVerificationService;
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}
  onModuleInit() {
    // Separate pool: rewards jobs never occupy the application's request pool.
    this.database = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: this.config.get("DATABASE_URL", { infer: true }),
        options: "-c timezone=UTC -c statement_timeout=5000",
        application_name: "fdp_rewards_worker",
        max: 2,
        connectionTimeoutMillis: 2000,
        idleTimeoutMillis: 10000
      })
    });
    this.rewards = new RewardsService(this.database as PrismaService);
    this.checks = new RewardVerificationService(this.rewards);
    this.timer = setInterval(() => {
      if (!this.active)
        this.active = this.run().finally(() => {
          this.active = undefined;
        });
    }, 30000).unref();
  }
  private async run() {
    try {
      await this.rewards!.processBatch();
      await this.rewards!.refundBatch();
      await this.checks!.checkBatch();
    } catch {
      this.logger.warn("Rewards background pass failed; pending work will retry");
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
    await this.database?.$disconnect();
  }
}
