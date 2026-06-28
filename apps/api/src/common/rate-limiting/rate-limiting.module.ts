import { Global, Module } from "@nestjs/common";

import { ApiRateLimiterService } from "./api-rate-limiter.service.js";

@Global()
@Module({
  exports: [ApiRateLimiterService],
  providers: [ApiRateLimiterService]
})
export class RateLimitingModule {}
