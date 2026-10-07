import { Module } from "@nestjs/common";

import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { UsersModule } from "../users/users.module.js";
import { TelegramBotController } from "./telegram-bot.controller.js";
import { TelegramBotService } from "./telegram-bot.service.js";
import { TelegramBrowserLoginController } from "./telegram-browser-login.controller.js";
import { TelegramBrowserLoginService } from "./telegram-browser-login.service.js";
import { TelegramTournamentBotController } from "./telegram-tournament-bot.controller.js";
import { TelegramTournamentBotService } from "./telegram-tournament-bot.service.js";
import { TelegramOfficialLoginController } from "./telegram-official-login.controller.js";
import { TelegramOfficialLoginService } from "./telegram-official-login.service.js";

@Module({
  controllers: [TelegramBotController, TelegramBrowserLoginController, TelegramTournamentBotController, TelegramOfficialLoginController],
  exports: [TelegramBotService],
  imports: [AuthModule, RateLimitingModule, UsersModule],
  providers: [TelegramBotService, TelegramBrowserLoginService, TelegramTournamentBotService, TelegramOfficialLoginService]
})
export class TelegramBotModule {}
