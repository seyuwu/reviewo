import type {
  ExtensionResolveFoundResponse,
  ExtensionResolveNotFoundResponse
} from "./types/resolve.js";
import type { ExtensionQuickRatingResponse } from "./types/quick-rating.js";

export function mergeQuickRatingIntoFoundResponse(
  current: ExtensionResolveFoundResponse,
  quickRating: ExtensionQuickRatingResponse
): ExtensionResolveFoundResponse {
  return {
    ...current,
    entity: quickRating.entity,
    rating: quickRating.rating,
    trust: quickRating.trust,
    url: current.url,
    web: quickRating.web
  };
}

export function toFoundResponseFromQuickRating(
  current: ExtensionResolveNotFoundResponse,
  quickRating: ExtensionQuickRatingResponse
): ExtensionResolveFoundResponse {
  return {
    entity: quickRating.entity,
    rating: quickRating.rating,
    status: "found",
    trust: quickRating.trust,
    url: current.url,
    web: quickRating.web
  };
}
