import { SetMetadata } from "@nestjs/common";

import type { AuthenticatedUser } from "../interfaces/authenticated-request.js";
import type { RateLimitRule, RequestLike } from "./api-rate-limiter.service.js";

export const RATE_LIMIT_RULES_METADATA_KEY = "reviewo:rate-limit-rules";

export interface RateLimitContext {
  request: RequestLike;
  user: AuthenticatedUser | undefined;
}

export type RateLimitRuleFactory = (context: RateLimitContext) => RateLimitRule[];

/**
 * Declarative rate limiting for a route handler. The rules are evaluated by
 * RateLimitGuard before the handler runs, so a route cannot ship without
 * limits when the guard is part of its guard chain.
 *
 * Place the guard after the auth guard so `user` is populated:
 *   @UseGuards(OptionalJwtAuthGuard, RateLimitGuard)
 *   @RateLimit(({ request }) => createSomeRateLimitRules(request))
 */
export const RateLimit = (rulesFactory: RateLimitRuleFactory): MethodDecorator =>
  SetMetadata(RATE_LIMIT_RULES_METADATA_KEY, rulesFactory);
