import { Body, Controller, Post, Req } from "@nestjs/common";

import {
  ApiRateLimiterService,
  resolveRequestIp,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { CollectAnalyticsDto } from "../dto/collect-analytics.dto.js";
import { ProductAnalyticsService } from "../services/product-analytics.service.js";

@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly productAnalyticsService: ProductAnalyticsService
  ) {}

  @Post("collect")
  async collect(
    @Body() input: CollectAnalyticsDto,
    @Req() request: RequestLike
  ): Promise<{ ok: true }> {
    await this.apiRateLimiterService.assertWithinLimits([
      {
        key: resolveRequestIp(request),
        limit: 60,
        message: "Too many analytics batches from this network",
        namespace: "analytics:collect:ip",
        windowSeconds: 60 * 60
      }
    ]);

    return this.productAnalyticsService.collect(input);
  }
}
