"use client";

import { useEffect, useState } from "react";

import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { formatScoreOneDecimal, formatStarRating } from "../../growth/lib/format-growth-stats";
import type { TranslateFn } from "@reviewo/i18n";
import { FeedSection } from "../../discovery/components/feed-section";
import { EntityAvatar } from "../../entities/components/entity-avatar";
import { fetchSpotlightFeed } from "../api/spotlight-api";
import type { SpotlightPlacement } from "../types/spotlight";
import { SpotlightPlacementLink } from "./spotlight-placement-link";

interface SpotlightHomeSectionProps {
  initialItems?: SpotlightPlacement[] | undefined;
  layout?: "list" | "showcase";
}

export function SpotlightHomeSection({ initialItems, layout = "list" }: SpotlightHomeSectionProps) {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const hasInitialData = initialItems !== undefined;
  const [items, setItems] = useState<SpotlightPlacement[]>(initialItems ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    let cancelled = false;

    void fetchSpotlightFeed(3, resolvedLocale)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
        }
      })
      .catch(() => {
        // Keep SSR snapshot on transient failures.
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedLocale]);

  if (!isLoading && items.length === 0) {
    return null;
  }

  return (
    <FeedSection
      heading={t("web.spotlight.homeSectionTitle")}
      headingId="home-spotlight-heading"
      viewAllHref="/spotlight"
    >
      {layout === "list" ? (
        <p className="muted-copy spotlight-home-caption">{t("web.spotlight.homeSectionCaption")}</p>
      ) : null}
      {isLoading ? (
        <p className="muted-copy">{t("chat.loading")}</p>
      ) : (
        <ul className={layout === "showcase" ? "spotlight-home-list spotlight-home-list--showcase" : "spotlight-home-list"}>
          {items.map((item) => (
            <li key={item.placementId}>
              <SpotlightPlacementLink
                className={layout === "showcase" ? "spotlight-home-card spotlight-home-card--showcase" : "spotlight-home-card"}
                href={item.href}
                placementId={item.placementId}
              >
                {layout === "showcase" ? (
                  <EntityAvatar
                    canonicalUrl={item.entityCanonicalUrl ?? null}
                    className="spotlight-home-logo"
                    entityId={item.entityId ?? item.placementId}
                    logoUrl={item.entityLogoUrl ?? null}
                    size="lg"
                    title={item.title}
                  />
                ) : null}
                <span className="spotlight-home-type">{formatPlacementType(item.placementType, t)}</span>
                <strong>{item.title}</strong>
                {item.recommendation?.entityRating && item.recommendation.entityRating.votesCount > 0 ? (
                  <span className="spotlight-home-rating">
                    <span aria-hidden="true">{formatStarRating(item.recommendation.entityRating.avgScore)}</span>
                    {formatScoreOneDecimal(item.recommendation.entityRating.avgScore)}/5
                  </span>
                ) : null}
                {item.recommendation?.reviewExcerpt || item.recommendation?.recommendationMessage ? (
                  <span className="spotlight-home-quote">
                    "{item.recommendation.reviewExcerpt ?? item.recommendation.recommendationMessage}"
                  </span>
                ) : null}
                <span className="spotlight-home-sponsor">
                  {t("web.spotlight.recommendedBy", {
                    user: item.recommendation?.authorDisplayName ?? item.sponsorDisplayName
                  })}
                </span>
              </SpotlightPlacementLink>
            </li>
          ))}
        </ul>
      )}
    </FeedSection>
  );
}

function formatPlacementType(type: SpotlightPlacement["placementType"], t: TranslateFn): string {
  switch (type) {
    case "entity_spotlight":
      return t("web.spotlight.type.entity");
    case "battle_boost":
      return t("web.spotlight.type.battle");
    case "top_highlight":
      return t("web.spotlight.type.top");
    default:
      return type;
  }
}
