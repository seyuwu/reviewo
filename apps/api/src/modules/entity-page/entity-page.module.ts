import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { RatingsModule } from "../ratings/ratings.module.js";
import { ReputationModule } from "../reputation/reputation.module.js";
import { ReviewsModule } from "../reviews/reviews.module.js";
import { UsersModule } from "../users/users.module.js";
import { EntityPageController } from "./controllers/entity-page.controller.js";
import { EntityPageService } from "./services/entity-page.service.js";

@Module({
  controllers: [EntityPageController],
  imports: [AuthModule, EntitiesModule, RatingsModule, ReviewsModule, ReputationModule, UsersModule],
  providers: [EntityPageService]
})
export class EntityPageModule {}
