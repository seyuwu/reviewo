import { Module } from "@nestjs/common";

import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { UsersModule } from "../users/users.module.js";
import {
  AdminGamesLaunchController,
  GamesLaunchController
} from "./controllers/games-launch.controller.js";
import { GamesLaunchSheetsService } from "./services/games-launch-sheets.service.js";
import { GamesLaunchService } from "./services/games-launch.service.js";

@Module({
  controllers: [GamesLaunchController, AdminGamesLaunchController],
  exports: [GamesLaunchService],
  imports: [AuthModule, UsersModule, AnalyticsModule],
  providers: [GamesLaunchService, GamesLaunchSheetsService]
})
export class GamesLaunchModule {}
