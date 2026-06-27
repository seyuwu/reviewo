import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";
import type { ExtensionQuickRatingResponse } from "../../shared/types/quick-rating.js";

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
