import { Module } from "@nestjs/common";
import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { TelegramBotModule } from "../telegram/telegram-bot.module.js";
import { UsersModule } from "../users/users.module.js";
import { AdminReferralsController, BotReferralsController } from "./referrals.controller.js";
import { ReferralsService } from "./referrals.service.js";

@Module({
  imports: [AuthModule, UsersModule, TelegramBotModule, RateLimitingModule],
  controllers: [AdminReferralsController, BotReferralsController],
  providers: [ReferralsService]
})
export class ReferralsModule {}
