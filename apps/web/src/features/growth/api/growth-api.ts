import { appendContentLocaleToPath, type ContentLocaleParam } from "../../i18n/content-locale";
import { apiRequest } from "../../../lib/api/api-client";
import { getOrCreateVoterId } from "../lib/voter-id";
import type { GrowthBattleResponse, GrowthBattleVoteResponse, GrowthCompareResponse } from "../types/growth";

export function fetchGrowthCompare(pairSlug: string): Promise<GrowthCompareResponse> {
  return apiRequest<GrowthCompareResponse>(`/growth/compare/${encodeURIComponent(pairSlug)}`);
}

export function fetchGrowthCompareByEntityIds(
  leftEntityId: string,
  rightEntityId: string
): Promise<GrowthCompareResponse> {
  return apiRequest<GrowthCompareResponse>(
    `/growth/compare/entities/${encodeURIComponent(leftEntityId)}/${encodeURIComponent(rightEntityId)}`
  );
}

export function fetchGrowthBattle(
  pairSlug: string,
  locale?: ContentLocaleParam
): Promise<GrowthBattleResponse> {
  const path = locale
    ? appendContentLocaleToPath(`/growth/battle/${encodeURIComponent(pairSlug)}`, locale)
    : `/growth/battle/${encodeURIComponent(pairSlug)}`;

  return apiRequest<GrowthBattleResponse>(path, {
    headers: {
      "x-opinia-voter": getOrCreateVoterId()
    }
  });
}

import type { AppLocale } from "@reviewo/i18n";

export function submitGrowthBattleVote(
  pairSlug: string,
  entityId: string,
  locale: AppLocale
): Promise<GrowthBattleVoteResponse> {
  return apiRequest<GrowthBattleVoteResponse>(`/growth/battle/${encodeURIComponent(pairSlug)}/vote`, {
    body: {
      entityId,
      locale
    },
    headers: {
      "x-opinia-voter": getOrCreateVoterId()
    },
    method: "POST"
  });
}
