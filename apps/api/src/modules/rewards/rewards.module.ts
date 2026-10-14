import { Module } from "@nestjs/common";
import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { TelegramBotModule } from "../telegram/telegram-bot.module.js";
import { UsersModule } from "../users/users.module.js";
import {
  AdminRewardsController,
  BotRewardsController,
  RewardsController
} from "./rewards.controller.js";
import { RewardsService } from "./rewards.service.js";
import { RewardVerificationService } from "./rewards.verification.js";
import { RewardsWorker } from "./rewards.worker.js";
import { RewardsAccessService, RewardsAdminGuard } from "./rewards-access.service.js";
import { RewardsTasksService } from "./rewards-tasks.service.js";
import { RewardsDatabase, RewardsAnalyticsDatabase } from "./rewards.database.js";
@Module({
  imports: [AuthModule, TelegramBotModule, RateLimitingModule, UsersModule],
  controllers: [AdminRewardsController, BotRewardsController, RewardsController],
  providers: [
    RewardsDatabase,
    RewardsAnalyticsDatabase,
    RewardsTasksService,
    RewardsService,
    RewardVerificationService,
    RewardsWorker,
    RewardsAccessService,
    RewardsAdminGuard
  ]
})
export class RewardsModule {}
