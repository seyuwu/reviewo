import { Module } from "@nestjs/common";
import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { TelegramBotModule } from "../telegram/telegram-bot.module.js";
import { UsersModule } from "../users/users.module.js";
import {
  AdminRewardsController,
  BotRewardsController,
  RewardsController,
  RewardSteamController
} from "./rewards.controller.js";
import { RewardsService } from "./rewards.service.js";
import { RewardVerificationService } from "./rewards.verification.js";
import { RewardsWorker } from "./rewards.worker.js";
@Module({
  imports: [AuthModule, TelegramBotModule, RateLimitingModule, UsersModule],
  controllers: [
    AdminRewardsController,
    BotRewardsController,
    RewardsController,
    RewardSteamController
  ],
  providers: [RewardsService, RewardVerificationService, RewardsWorker]
})
export class RewardsModule {}
