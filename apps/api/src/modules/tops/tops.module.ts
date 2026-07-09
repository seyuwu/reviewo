import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { RatingsModule } from "../ratings/ratings.module.js";
import { UsersModule } from "../users/users.module.js";
import { TopsController } from "./controllers/tops.controller.js";
import { TOPS_PORT } from "./interfaces/tops.port.js";
import { TopCategoriesRepository } from "./repositories/top-categories.repository.js";
import { TopEngagementRepository } from "./repositories/top-engagement.repository.js";
import { SystemTopsRepository } from "./repositories/system-tops.repository.js";
import { TopsRepository } from "./repositories/tops.repository.js";
import { SystemTopsService } from "./services/system-tops.service.js";
import { SystemTopsStartupRefreshService } from "./services/system-tops-startup-refresh.service.js";
import { TopCompositionService } from "./services/top-composition.service.js";
import { TopsService } from "./services/tops.service.js";
import { UserTopRankService } from "./services/user-top-rank.service.js";

@Module({
  controllers: [TopsController],
  exports: [TOPS_PORT, SystemTopsService, TopCompositionService, TopsService],
  imports: [AuthModule, EntitiesModule, RatingsModule, UsersModule],
  providers: [
    SystemTopsRepository,
    SystemTopsService,
    SystemTopsStartupRefreshService,
    TopCategoriesRepository,
    TopCompositionService,
    TopEngagementRepository,
    TopsRepository,
    TopsService,
    UserTopRankService,
    {
      provide: TOPS_PORT,
      useExisting: TopsService
    }
  ]
})
export class TopsModule {}
