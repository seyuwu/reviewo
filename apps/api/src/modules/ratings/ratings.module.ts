import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { UsersModule } from "../users/users.module.js";
import { RatingsController } from "./controllers/ratings.controller.js";
import { RATINGS_PORT } from "./interfaces/ratings.port.js";
import { RatingsRepository } from "./repositories/ratings.repository.js";
import { RatingsService } from "./services/ratings.service.js";

@Module({
  controllers: [RatingsController],
  exports: [RATINGS_PORT, RatingsService],
  imports: [AuthModule, EntitiesModule, UsersModule],
  providers: [
    RatingsRepository,
    RatingsService,
    {
      provide: RATINGS_PORT,
      useExisting: RatingsService
    }
  ]
})
export class RatingsModule {}
