import { createHash } from "node:crypto";

import { resolveRequestIp, type RequestLike } from "./rate-limiting/api-rate-limiter.service.js";

export function resolveVoterKey(voterHeader: string | undefined, request?: RequestLike): string {
  const voterId = voterHeader?.trim() || "anonymous";

  if (!request) {
    return hashVoterKey(voterId);
  }

  return hashVoterKey(`${voterId}:${resolveRequestIp(request)}`);
}

export function hashVoterKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
