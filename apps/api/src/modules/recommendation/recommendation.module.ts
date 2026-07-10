import { Module } from "@nestjs/common";

import { RecommendationEndorsementsRepository } from "./repositories/recommendation-endorsements.repository.js";
import { RecommendationsRepository } from "./repositories/recommendations.repository.js";

@Module({
  exports: [RecommendationEndorsementsRepository, RecommendationsRepository],
  providers: [RecommendationEndorsementsRepository, RecommendationsRepository]
})
export class RecommendationModule {}
