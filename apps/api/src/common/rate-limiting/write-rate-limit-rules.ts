import {
  resolveRequestIp,
  type RateLimitRule,
  type RequestLike
} from "./api-rate-limiter.service.js";

export function createEntityCreationRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 10,
      message: "Too many entity creation attempts from this account",
      namespace: "entities:create:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 30,
      message: "Too many entity creation attempts from this network",
      namespace: "entities:create:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createTrustCheckRateLimitRules(request: RequestLike): RateLimitRule[] {
  return [
    {
      key: resolveRequestIp(request),
      limit: 60,
      message: "Too many link checks from this network",
      namespace: "trust-check:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createReviewWriteRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 20,
      message: "Too many review updates from this account",
      namespace: "reviews:write:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 60,
      message: "Too many review updates from this network",
      namespace: "reviews:write:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createReviewVoteRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 120,
      message: "Too many review votes from this account",
      namespace: "reviews:vote:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 300,
      message: "Too many review votes from this network",
      namespace: "reviews:vote:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createPresenceHeartbeatRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 180,
      message: "Too many chat presence updates from this account",
      namespace: "chat:presence:user",
      windowSeconds: 15 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 600,
      message: "Too many chat presence updates from this network",
      namespace: "chat:presence:ip",
      windowSeconds: 15 * 60
    }
  ];
}
