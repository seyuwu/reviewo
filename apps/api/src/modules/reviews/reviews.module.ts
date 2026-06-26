import { Module } from "@nestjs/common";

import { DomainEventsModule } from "../../common/domain-events/domain-events.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { UsersModule } from "../users/users.module.js";
import { ReviewsController } from "./controllers/reviews.controller.js";
import { REVIEWS_PORT } from "./interfaces/reviews.port.js";
import { ReviewsRepository } from "./repositories/reviews.repository.js";
import { ReviewsService } from "./services/reviews.service.js";

@Module({
  controllers: [ReviewsController],
  exports: [REVIEWS_PORT, ReviewsService],
  imports: [AuthModule, DomainEventsModule, EntitiesModule, UsersModule],
  providers: [
    ReviewsRepository,
    ReviewsService,
    {
      provide: REVIEWS_PORT,
      useExisting: ReviewsService
    }
  ]
})
export class ReviewsModule {}
