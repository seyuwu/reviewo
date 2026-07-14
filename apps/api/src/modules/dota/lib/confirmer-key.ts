import { createHash } from "node:crypto";

import { resolveRequestIp, type RequestLike } from "../../../common/rate-limiting/api-rate-limiter.service.js";

export function buildConfirmerKey(
  visitorId: string | undefined,
  request: RequestLike,
  userId?: string
): string {
  const normalizedUserId = userId?.trim();

  if (normalizedUserId) {
    return hashConfirmerInput(`user:${normalizedUserId}`);
  }

  const normalizedVisitorId = visitorId?.trim();

  if (normalizedVisitorId) {
    return hashConfirmerInput(`visitor:${normalizedVisitorId}`);
  }

  const ip = resolveRequestIp(request) ?? "unknown";
  const userAgent =
    typeof request.headers?.["user-agent"] === "string" ? request.headers["user-agent"] : "unknown";

  return hashConfirmerInput(`fallback:${ip}:${userAgent}`);
}

function hashConfirmerInput(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
