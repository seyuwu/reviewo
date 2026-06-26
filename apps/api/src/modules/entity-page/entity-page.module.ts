import { Module } from "@nestjs/common";

import { EntitiesModule } from "../entities/entities.module.js";
import { RatingsModule } from "../ratings/ratings.module.js";
import { ReviewsModule } from "../reviews/reviews.module.js";
import { TrustModule } from "../trust/trust.module.js";
import { EntityPageController } from "./controllers/entity-page.controller.js";
import { EntityPageService } from "./services/entity-page.service.js";

@Module({
  controllers: [EntityPageController],
  imports: [EntitiesModule, RatingsModule, ReviewsModule, TrustModule],
  providers: [EntityPageService]
})
export class EntityPageModule {}
