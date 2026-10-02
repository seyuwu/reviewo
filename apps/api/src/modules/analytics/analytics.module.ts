import { Module } from "@nestjs/common";

import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AnalyticsController } from "./controllers/analytics.controller.js";
import { AnalyticsRepository } from "./repositories/analytics.repository.js";
import { DotaSearchHistoryService } from "./services/dota-search-history.service.js";
import { ProductAnalyticsService } from "./services/product-analytics.service.js";

@Module({
  controllers: [AnalyticsController],
  exports: [DotaSearchHistoryService, ProductAnalyticsService],
  imports: [RateLimitingModule],
  providers: [AnalyticsRepository, DotaSearchHistoryService, ProductAnalyticsService]
})
export class AnalyticsModule {}
