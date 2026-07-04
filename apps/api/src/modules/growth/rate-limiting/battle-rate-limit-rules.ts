import { type RateLimitRule, resolveRequestIp, type RequestLike } from "../../../common/rate-limiting/api-rate-limiter.service.js";

export function createBattleVoteRateLimitRules(request: RequestLike): RateLimitRule[] {
  return [
    {
      key: resolveRequestIp(request),
      limit: 60,
      message: "Too many battle votes from this network",
      namespace: "growth:battle-vote:ip",
      windowSeconds: 60 * 60
    }
  ];
}
