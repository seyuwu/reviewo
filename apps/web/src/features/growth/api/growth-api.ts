import { apiRequest } from "../../../lib/api/api-client";
import { getOrCreateVoterId } from "../lib/voter-id";
import type { GrowthBattleResponse, GrowthBattleVoteResponse, GrowthCompareResponse } from "../types/growth";

export function fetchGrowthCompare(pairSlug: string): Promise<GrowthCompareResponse> {
  return apiRequest<GrowthCompareResponse>(`/growth/compare/${encodeURIComponent(pairSlug)}`);
}

export function fetchGrowthBattle(pairSlug: string): Promise<GrowthBattleResponse> {
  return apiRequest<GrowthBattleResponse>(`/growth/battle/${encodeURIComponent(pairSlug)}`, {
    headers: {
      "x-opinia-voter": getOrCreateVoterId()
    }
  });
}

export function submitGrowthBattleVote(
  pairSlug: string,
  entityId: string
): Promise<GrowthBattleVoteResponse> {
  return apiRequest<GrowthBattleVoteResponse>(`/growth/battle/${encodeURIComponent(pairSlug)}/vote`, {
    body: { entityId },
    headers: {
      "x-opinia-voter": getOrCreateVoterId()
    },
    method: "POST"
  });
}
