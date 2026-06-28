import { Body, Controller, Post, Req } from "@nestjs/common";

import {
  ApiRateLimiterService,
  type RequestLike
} from "../../../common/rate-limiting/api-rate-limiter.service.js";
import { createTrustCheckRateLimitRules } from "../../../common/rate-limiting/write-rate-limit-rules.js";
import { TrustCheckDto } from "../dto/trust-check.dto.js";
import { TrustCheckResponseDto } from "../dto/trust-check-response.dto.js";
import { EntitiesService } from "../services/entities.service.js";

@Controller("trust-check")
export class TrustCheckController {
  constructor(
    private readonly apiRateLimiterService: ApiRateLimiterService,
    private readonly entitiesService: EntitiesService
  ) {}

  @Post()
  async checkUrl(
    @Body() input: TrustCheckDto,
    @Req() request: RequestLike
  ): Promise<TrustCheckResponseDto> {
    await this.apiRateLimiterService.assertWithinLimits(createTrustCheckRateLimitRules(request));

    return this.entitiesService.trustCheckUrl(input.url);
  }
}
