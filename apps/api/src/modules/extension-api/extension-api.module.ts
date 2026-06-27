import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { RatingsModule } from "../ratings/ratings.module.js";
import { TrustModule } from "../trust/trust.module.js";
import { UsersModule } from "../users/users.module.js";
import { ExtensionApiController } from "./controllers/extension-api.controller.js";
import { ExtensionApiService } from "./services/extension-api.service.js";
import { RateSiteUseCase } from "./use-cases/rate-site.use-case.js";

@Module({
  controllers: [ExtensionApiController],
  imports: [AuthModule, EntitiesModule, RatingsModule, TrustModule, UsersModule],
  providers: [ExtensionApiService, RateSiteUseCase]
})
export class ExtensionApiModule {}
