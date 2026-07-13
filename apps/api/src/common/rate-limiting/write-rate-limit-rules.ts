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
      limit: 20,
      message: "Too many entity creation attempts from this account",
      namespace: "entities:create:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 60,
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

export function createDotaConfirmationRateLimitRules(request: RequestLike): RateLimitRule[] {
  return [
    {
      key: resolveRequestIp(request),
      limit: 10,
      message: "Too many confirmation attempts from this network",
      namespace: "dota:confirm:ip",
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

export function createTopWriteRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 10,
      message: "Too many top updates from this account",
      namespace: "tops:write:user",
      windowSeconds: 60 * 60 * 24
    },
    {
      key: resolveRequestIp(request),
      limit: 30,
      message: "Too many top updates from this network",
      namespace: "tops:write:ip",
      windowSeconds: 60 * 60 * 24
    }
  ];
}

export function createTopItemsWriteRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 60,
      message: "Too many top item updates from this account",
      namespace: "tops:items:write:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 180,
      message: "Too many top item updates from this network",
      namespace: "tops:items:write:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createTopCommentWriteRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 30,
      message: "Too many top comments from this account",
      namespace: "tops:comment:write:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 90,
      message: "Too many top comments from this network",
      namespace: "tops:comment:write:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createTopLikeRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 120,
      message: "Too many top likes from this account",
      namespace: "tops:like:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 300,
      message: "Too many top likes from this network",
      namespace: "tops:like:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createTopViewRateLimitRules(request: RequestLike): RateLimitRule[] {
  return [
    {
      key: resolveRequestIp(request),
      limit: 300,
      message: "Too many top views from this network",
      namespace: "tops:view:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createSpotlightEndorseRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 60,
      message: "Too many recommendation endorsements from this account",
      namespace: "spotlight:endorse:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 180,
      message: "Too many recommendation endorsements from this network",
      namespace: "spotlight:endorse:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createSpotlightSpendRateLimitRules(
  userId: string,
  request: RequestLike
): RateLimitRule[] {
  return [
    {
      key: userId,
      limit: 20,
      message: "Too many spotlight spends from this account",
      namespace: "spotlight:spend:user",
      windowSeconds: 60 * 60
    },
    {
      key: resolveRequestIp(request),
      limit: 60,
      message: "Too many spotlight spends from this network",
      namespace: "spotlight:spend:ip",
      windowSeconds: 60 * 60
    }
  ];
}

export function createSpotlightEventRateLimitRules(request: RequestLike): RateLimitRule[] {
  return [
    {
      key: resolveRequestIp(request),
      limit: 600,
      message: "Too many spotlight events from this network",
      namespace: "spotlight:event:ip",
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
