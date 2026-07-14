import { Module } from "@nestjs/common";

import { RateLimitingModule } from "../../common/rate-limiting/rate-limiting.module.js";
import { AnalyticsController } from "./controllers/analytics.controller.js";
import { AnalyticsRepository } from "./repositories/analytics.repository.js";
import { ProductAnalyticsService } from "./services/product-analytics.service.js";

@Module({
  controllers: [AnalyticsController],
  exports: [ProductAnalyticsService],
  imports: [RateLimitingModule],
  providers: [AnalyticsRepository, ProductAnalyticsService]
})
export class AnalyticsModule {}
