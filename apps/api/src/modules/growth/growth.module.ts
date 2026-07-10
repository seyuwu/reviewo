import { Module } from "@nestjs/common";

import { DomainEventsModule } from "../../common/domain-events/domain-events.module.js";
import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { EntitiesModule } from "../entities/entities.module.js";
import { RatingsModule } from "../ratings/ratings.module.js";
import { ReputationModule } from "../reputation/reputation.module.js";
import { ReviewsModule } from "../reviews/reviews.module.js";
import { UsersModule } from "../users/users.module.js";
import { GrowthController } from "./controllers/growth.controller.js";
import { BattleVoteRepository } from "./repositories/battle-vote.repository.js";
import { GrowthCompareService } from "./services/growth-compare.service.js";

@Module({
  controllers: [GrowthController],
  imports: [
    AuthModule,
    DomainEventsModule,
    EntitiesModule,
    RateLimitingModule,
    RatingsModule,
    ReviewsModule,
    ReputationModule,
    UsersModule
  ],
  providers: [BattleVoteRepository, GrowthCompareService]
})
export class GrowthModule {}
