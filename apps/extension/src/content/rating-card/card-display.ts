import type { ExtensionResolveFoundResponse } from "../../shared/types/resolve.js";
import { buildRatingCardSummary } from "./format-display.js";

export interface CardDisplayContext {
  detailsEntityPagePath: string;
  eyebrowLabel: string;
  primaryStatsMarkup: string;
  secondaryStatsMarkup: string;
  title: string;
}

export function buildCardDisplayContext(
  response: ExtensionResolveFoundResponse,
  escapeHtmlText: (value: string) => string
): CardDisplayContext {
  const summary = buildRatingCardSummary({
    entity: response.entity,
    rating: response.rating,
    status: "found",
    trust: response.trust,
    url: {
      canonical: response.entity.canonicalUrl ?? "",
      input: response.entity.canonicalUrl ?? ""
    },
    web: response.web
  });

  const primaryStatsMarkup = summary.hasRatings
    ? `
    <div class="reviewo-stats">
      <div class="reviewo-rating-row">
        <span class="reviewo-rating-value">${escapeHtmlText(summary.averageScoreLabel)}</span>
        <span class="reviewo-rating-scale">/ 5</span>
      </div>
      <p class="reviewo-meta">${escapeHtmlText(summary.metaLabel)}</p>
    </div>
  `
    : `
    <div class="reviewo-stats reviewo-stats-empty">
      <p class="reviewo-no-ratings">${escapeHtmlText("No ratings yet")}</p>
      <p class="reviewo-meta">${escapeHtmlText("Be the first to rate")}</p>
    </div>
  `;

  return {
    detailsEntityPagePath: response.web.entityPagePath,
    eyebrowLabel: "Current page",
    primaryStatsMarkup,
    secondaryStatsMarkup: "",
    title: response.entity.title
  };
}

export function getRateTargetEntityId(response: ExtensionResolveFoundResponse): string {
  return response.entity.id;
}
