"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { ContentLocaleToggle } from "../../i18n/content-locale-toggle";
import { EntityAvatar } from "../../entities/components/entity-avatar";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { formatScoreOneDecimal, formatStarRating } from "../../growth/lib/format-growth-stats";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import type { TranslateFn } from "@reviewo/i18n";
import type { ContentLocaleParam } from "../../i18n/content-locale";
import { fetchSpotlightFeed } from "../api/spotlight-api";
import { formatSpotlightEndsIn } from "../lib/format-spotlight-placement";
import type { SpotlightFeedResponse, SpotlightPlacement, SpotlightSpendFormKey } from "../types/spotlight";
import { SpotlightEndorseButton } from "./spotlight-endorse-button";
import { SpotlightPlacementLink } from "./spotlight-placement-link";
import { SpotlightRecommendModal } from "./spotlight-recommend-modal";
import { SpotlightSpendPanel } from "./spotlight-spend-panel";

interface SpotlightPageViewProps {
  initialContentLocale: ContentLocaleParam;
  initialData: SpotlightFeedResponse | null;
}

export function SpotlightPageView({ initialContentLocale, initialData }: SpotlightPageViewProps) {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const { authSession } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const [showAllLocales, setShowAllLocales] = useState(false);
  const contentLocale = (showAllLocales
    ? "all"
    : resolvedLocale === "ru" || resolvedLocale === "en"
      ? resolvedLocale
      : initialContentLocale) as ContentLocaleParam;
  const canUseInitialData =
    initialData !== null &&
    initialContentLocale === contentLocale &&
    !showAllLocales;
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [activeSpendForm, setActiveSpendForm] = useState<SpotlightSpendFormKey>("entity");

  const feedQuery = useQuery({
    initialData: canUseInitialData ? initialData : undefined,
    queryFn: () => fetchSpotlightFeed(30, contentLocale, accessToken),
    queryKey: ["spotlight-feed", contentLocale, accessToken ?? null],
    placeholderData: keepPreviousData,
    refetchOnMount: "always",
    staleTime: 0
  });
  const items = feedQuery.data?.items ?? [];
  const showFeedLoading = feedQuery.isLoading && items.length === 0;

  function openRecommend(form: SpotlightSpendFormKey = "entity") {
    setActiveSpendForm(form);
    setRecommendOpen(true);
  }

  return (
    <section className="spotlight-page ui-fade-in">
      <section aria-labelledby="spotlight-feed-heading" className="spotlight-feed-section">
        <div className="spotlight-feed-header section-heading">
          <h2 id="spotlight-feed-heading">{t("web.spotlight.feedTitle")}</h2>
          <div className="spotlight-feed-actions">
            <ContentLocaleToggle
              locale={resolvedLocale}
              showAll={showAllLocales}
              onToggle={() => {
                setShowAllLocales((current) => !current);
              }}
            />
            <button className="primary-button" type="button" onClick={() => openRecommend("entity")}>
              {t("web.spotlight.recommendSectionTitle")}
            </button>
          </div>
        </div>

        {showFeedLoading ? (
          <p className="muted-copy">{t("chat.loading")}</p>
        ) : items.length === 0 ? (
          <div className="panel-card spotlight-empty-card">
            <p className="muted-copy">{t("web.spotlight.empty")}</p>
            <button className="primary-button spotlight-empty-recommend" type="button" onClick={() => openRecommend("entity")}>
              {t("web.spotlight.recommendSectionTitle")}
            </button>
          </div>
        ) : (
          <div className="spotlight-feed">
            {items.map((item) => (
              <SpotlightPlacementCard item={item} key={item.placementId} />
            ))}
          </div>
        )}
      </section>

      {recommendOpen ? (
        <SpotlightRecommendModal
          activeForm={activeSpendForm}
          onClose={() => setRecommendOpen(false)}
          onFormChange={setActiveSpendForm}
        >
          <SpotlightSpendPanel
            activeForm={activeSpendForm}
            inModal
            onSpendSuccess={() => setRecommendOpen(false)}
          />
        </SpotlightRecommendModal>
      ) : null}
    </section>
  );
}

function SpotlightPlacementCard({ item }: { item: SpotlightPlacement }) {
  const t = useTranslation();
  const recommendation = item.recommendation;
  const authorName = recommendation?.authorDisplayName ?? item.sponsorDisplayName;
  const endsAt = recommendation?.endsAt ?? item.endsAt;
  const reviewExcerpt = recommendation?.reviewExcerpt;
  const recommendationMessage = recommendation?.recommendationMessage;
  const pitchExcerpt = reviewExcerpt ?? recommendationMessage;
  const entityRating = recommendation?.entityRating;
  const isEntity = item.placementType === "entity_spotlight";

  return (
    <article className="panel-card spotlight-card spotlight-card-rich">
      <div className="spotlight-card-top">
        {isEntity && item.entityId ? (
          <EntityAvatar
            canonicalUrl={item.entityCanonicalUrl ?? null}
            className="spotlight-card-avatar"
            entityId={item.entityId}
            logoUrl={item.entityLogoUrl ?? null}
            size="md"
            title={item.title}
          />
        ) : null}
        <div className="spotlight-card-top-copy">
          <p className="spotlight-card-sponsor">
            {t("web.spotlight.recommendedBy", { user: authorName })}
          </p>
          <h3 className="spotlight-card-title">
            <SpotlightPlacementLink
              className="spotlight-card-title-link"
              href={item.href}
              placementId={item.placementId}
            >
              {item.title}
            </SpotlightPlacementLink>
          </h3>
        </div>
      </div>

      {isEntity && entityRating && entityRating.votesCount > 0 ? (
        <div className="spotlight-card-rating">
          <span aria-hidden="true">{formatStarRating(entityRating.avgScore)}</span>
          <strong>{formatScoreOneDecimal(entityRating.avgScore)}/5</strong>
          <span className="muted-copy">
            {t("web.spotlight.votesCount", { count: String(entityRating.votesCount) })}
          </span>
        </div>
      ) : null}

      {isEntity ? (
        pitchExcerpt ? (
          <blockquote className="spotlight-card-quote">"{pitchExcerpt}"</blockquote>
        ) : (
          <p className="muted-copy spotlight-card-no-review">{t("web.spotlight.noReviewYet")}</p>
        )
      ) : null}

      <SpotlightEndorseButton item={item} />

      <div className="spotlight-card-footer">
        <span className="spotlight-card-ends">{formatSpotlightEndsIn(endsAt, t)}</span>
        <SpotlightPlacementLink className="primary-link" href={item.href} placementId={item.placementId}>
          {formatPlacementAction(item.placementType, t)}
        </SpotlightPlacementLink>
      </div>

      <p className="spotlight-card-credits-footnote">{t("web.spotlight.supportedByCredits")}</p>
    </article>
  );
}

function formatPlacementAction(type: SpotlightPlacement["placementType"], t: TranslateFn): string {
  switch (type) {
    case "entity_spotlight":
      return t("web.spotlight.action.open");
    case "battle_boost":
      return t("web.spotlight.action.compare");
    case "top_highlight":
      return t("web.spotlight.action.openTop");
    default:
      return t("web.contribute.open");
  }
}
