import {
  resolveRequestIp,
  type RateLimitRule,
  type RequestLike
} from "./api-rate-limiter.service.js";

export function createRatingRateLimitRules(userId: string, request: RequestLike): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 30,
      message: "Too many rating updates from this account",
      namespace: "ratings:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 90,
      message: "Too many rating updates from this network",
      namespace: "ratings:ip",
      windowSeconds: 60 * 60
    }
  ];
}
