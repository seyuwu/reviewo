import { apiRequest } from "../../../lib/api/api-client";
import { appendContentLocaleToPath } from "../../i18n/content-locale";
import type { ContentLocaleParam } from "../../i18n/content-locale";
import type {
  SpendSpotlightResponse,
  SpotlightCosts,
  SpotlightCredits,
  SpotlightEndorseResponse,
  SpotlightFeedResponse
} from "../types/spotlight";

export function fetchSpotlightFeed(
  limit = 30,
  locale?: ContentLocaleParam,
  accessToken?: string
): Promise<SpotlightFeedResponse> {
  const path = locale
    ? appendContentLocaleToPath(`/spotlight?limit=${limit}`, locale)
    : `/spotlight?limit=${limit}`;

  if (accessToken) {
    return apiRequest<SpotlightFeedResponse>(path, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
  }

  return apiRequest<SpotlightFeedResponse>(path);
}

export function fetchSpotlightCosts(): Promise<SpotlightCosts> {
  return apiRequest<SpotlightCosts>("/spotlight/costs");
}

export function fetchMySpotlightCredits(accessToken: string): Promise<SpotlightCredits> {
  return apiRequest<SpotlightCredits>("/users/me/spotlight-credits", {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
}

export function spendSpotlightOnEntity(
  accessToken: string,
  entityId: string,
  credits?: number,
  message?: string,
  locale?: ContentLocaleParam
): Promise<SpendSpotlightResponse> {
  const trimmedMessage = message?.trim();

  return apiRequest<SpendSpotlightResponse>("/spotlight/entity", {
    body: {
      entityId,
      ...(credits !== undefined ? { credits } : {}),
      ...(trimmedMessage ? { message: trimmedMessage } : {}),
      ...(locale === "ru" || locale === "en" ? { locale } : {})
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}

export function spendSpotlightOnBattle(
  accessToken: string,
  pairSlug: string,
  credits?: number,
  locale?: ContentLocaleParam
): Promise<SpendSpotlightResponse> {
  return apiRequest<SpendSpotlightResponse>("/spotlight/battle", {
    body: {
      pairSlug,
      ...(credits !== undefined ? { credits } : {}),
      ...(locale === "ru" || locale === "en" ? { locale } : {})
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}

export function spendSpotlightOnTop(
  accessToken: string,
  topId: string,
  credits?: number,
  locale?: ContentLocaleParam
): Promise<SpendSpotlightResponse> {
  return apiRequest<SpendSpotlightResponse>("/spotlight/top", {
    body: {
      topId,
      ...(credits !== undefined ? { credits } : {}),
      ...(locale === "ru" || locale === "en" ? { locale } : {})
    },
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}

export function endorseSpotlightPlacement(
  accessToken: string,
  placementId: string
): Promise<SpotlightEndorseResponse> {
  return apiRequest<SpotlightEndorseResponse>(`/spotlight/placements/${placementId}/endorse`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "POST"
  });
}

export function unendorseSpotlightPlacement(
  accessToken: string,
  placementId: string
): Promise<SpotlightEndorseResponse> {
  return apiRequest<SpotlightEndorseResponse>(`/spotlight/placements/${placementId}/endorse`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    method: "DELETE"
  });
}
