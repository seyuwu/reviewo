import type { CardDisplayTarget } from "../../shared/preferences.js";
import type {
  ExtensionResolveEntityBundle,
  ExtensionResolveFoundResponse
} from "../../shared/types/resolve.js";
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
  displayTarget: CardDisplayTarget,
  escapeHtmlText: (value: string) => string
): CardDisplayContext {
  const currentBundle = toEntityBundle(response);
  const parentBundle = response.parent;
  const effectiveTarget = resolveEffectiveDisplayTarget(displayTarget, parentBundle);
  const primaryBundle = pickPrimaryBundle(effectiveTarget, currentBundle, parentBundle);
  const secondaryBundle = pickSecondaryBundle(effectiveTarget, currentBundle, parentBundle);

  return {
    detailsEntityPagePath: primaryBundle.web.entityPagePath,
    eyebrowLabel: effectiveTarget === "parent" ? "Parent site" : "Current page",
    primaryStatsMarkup: renderBundleStats(primaryBundle, escapeHtmlText),
    secondaryStatsMarkup: secondaryBundle
      ? renderParentStatsRow(secondaryBundle, escapeHtmlText)
      : "",
    title: primaryBundle.entity.title
  };
}

function resolveEffectiveDisplayTarget(
  displayTarget: CardDisplayTarget,
  parentBundle: ExtensionResolveEntityBundle | undefined
): CardDisplayTarget {
  if (displayTarget === "parent" && !parentBundle) {
    return "current";
  }

  return displayTarget;
}

function pickPrimaryBundle(
  displayTarget: CardDisplayTarget,
  currentBundle: ExtensionResolveEntityBundle,
  parentBundle: ExtensionResolveEntityBundle | undefined
): ExtensionResolveEntityBundle {
  if (displayTarget === "parent" && parentBundle) {
    return parentBundle;
  }

  return currentBundle;
}

function pickSecondaryBundle(
  displayTarget: CardDisplayTarget,
  currentBundle: ExtensionResolveEntityBundle,
  parentBundle: ExtensionResolveEntityBundle | undefined
): ExtensionResolveEntityBundle | undefined {
  if (displayTarget !== "both" || !parentBundle) {
    return undefined;
  }

  return parentBundle;
}

export function getRateTargetEntityId(
  response: ExtensionResolveFoundResponse,
  displayTarget: CardDisplayTarget
): string {
  if (displayTarget === "parent" && response.parent) {
    return response.parent.entity.id;
  }

  return response.entity.id;
}

function toEntityBundle(response: ExtensionResolveFoundResponse): ExtensionResolveEntityBundle {
  return {
    entity: response.entity,
    rating: response.rating,
    trust: response.trust,
    web: response.web
  };
}

function renderBundleStats(
  bundle: ExtensionResolveEntityBundle,
  escapeHtmlText: (value: string) => string
): string {
  const summary = buildRatingCardSummary({
    entity: bundle.entity,
    rating: bundle.rating,
    status: "found",
    trust: bundle.trust,
    url: {
      canonical: bundle.entity.canonicalUrl ?? "",
      input: bundle.entity.canonicalUrl ?? ""
    },
    web: bundle.web
  });

  if (!summary.hasRatings) {
    return `
    <div class="reviewo-stats reviewo-stats-empty">
      <p class="reviewo-no-ratings">${escapeHtmlText("No ratings yet")}</p>
      <p class="reviewo-meta">${escapeHtmlText("Be the first to rate")}</p>
    </div>
  `;
  }

  return `
    <div class="reviewo-stats">
      <div class="reviewo-rating-row">
        <span class="reviewo-rating-value">${escapeHtmlText(summary.averageScoreLabel)}</span>
        <span class="reviewo-rating-scale">/ 5</span>
      </div>
      <p class="reviewo-meta">${escapeHtmlText(summary.metaLabel)}</p>
    </div>
  `;
}

function renderParentStatsRow(
  bundle: ExtensionResolveEntityBundle,
  escapeHtmlText: (value: string) => string
): string {
  const summary = buildRatingCardSummary({
    entity: bundle.entity,
    rating: bundle.rating,
    status: "found",
    trust: bundle.trust,
    url: {
      canonical: bundle.entity.canonicalUrl ?? "",
      input: bundle.entity.canonicalUrl ?? ""
    },
    web: bundle.web
  });

  const parentStatsLabel = summary.hasRatings
    ? `${summary.averageScoreLabel} / 5 · ${summary.metaLabel}`
    : summary.metaLabel;

  return `
    <div class="reviewo-parent-stats">
      <p class="reviewo-parent-label">Parent site</p>
      <p class="reviewo-parent-title">${escapeHtmlText(bundle.entity.title)}</p>
      <p class="reviewo-meta">${escapeHtmlText(parentStatsLabel)}</p>
    </div>
  `;
}
