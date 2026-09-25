import { Module } from "@nestjs/common";

import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { TelegramBotController } from "./telegram-bot.controller.js";
import { TelegramBotService } from "./telegram-bot.service.js";

@Module({
  controllers: [TelegramBotController],
  exports: [TelegramBotService],
  imports: [AuthModule, RateLimitingModule],
  providers: [TelegramBotService]
})
export class TelegramBotModule {}
