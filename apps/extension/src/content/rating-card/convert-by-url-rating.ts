import type { ExtensionByUrlRatingResponse } from "../../shared/types/quick-rating.js";
import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";

export function toFoundResponseFromByUrlRating(
  result: ExtensionByUrlRatingResponse
): ExtensionResolveFoundResponse {
  return {
    entity: result.entity,
    rating: result.rating,
    status: "found",
    trust: result.trust,
    url: result.url,
    web: result.web
  };
}
