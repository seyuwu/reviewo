import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest } from "../interfaces/authenticated-request.js";
import { ApiRateLimiterService, type RequestLike } from "./api-rate-limiter.service.js";
import {
  RATE_LIMIT_RULES_METADATA_KEY,
  type RateLimitRuleFactory
} from "./rate-limit.decorator.js";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiRateLimiterService: ApiRateLimiterService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rulesFactory = this.reflector.get<RateLimitRuleFactory>(
      RATE_LIMIT_RULES_METADATA_KEY,
      context.getHandler()
    );

    if (!rulesFactory) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike & AuthenticatedRequest>();

    await this.apiRateLimiterService.assertWithinLimits(
      rulesFactory({ request, user: request.user })
    );

    return true;
  }
}
