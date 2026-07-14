"use client";

import Link from "next/link";

import { OpiniaIcon } from "../../../components/opinia-icon";
import { EntityAvatar } from "../../entities/components/entity-avatar";
import { formatScoreOneDecimal, formatStarRating } from "../../growth/lib/format-growth-stats";
import { formatEntityHeroTitle } from "../../growth/lib/format-entity-display-name";
import { formatEntityTypeLabel } from "../../i18n/entity-type-label";
import { useTranslation } from "../../i18n/locale-provider";
import { navigateToEntitySection } from "../lib/entity-section-nav";
import type { EntityPageResponse } from "../types/entity-page";
import styles from "./entity-hero-bar.module.css";

interface EntityHeroBarProps {
  pageData: EntityPageResponse;
  returnQuery: string;
  showRelatedPresencesNav?: boolean;
  showUserTopsNav?: boolean;
  userTopsCount?: number;
}

export function EntityHeroBar({
  pageData,
  returnQuery,
  showRelatedPresencesNav = false,
  showUserTopsNav = false,
  userTopsCount = 0
}: EntityHeroBarProps) {
  const t = useTranslation();
  const parentHref = pageData.parent ? buildEntityHref(pageData.parent.id, returnQuery) : null;
  const hostname = formatHostname(pageData.entity.canonicalUrl);
  const displayTitle = formatEntityHeroTitle(pageData.entity);
  const description = pageData.entity.description?.trim() ?? "";
  const confidencePercent = Math.round(pageData.trust.confidence * 100);
  const manipulationRiskPercent = Math.round((pageData.trust.manipulationRisk ?? 0) * 100);
  const riskTone =
    manipulationRiskPercent >= 35 ? styles.riskHigh : manipulationRiskPercent >= 15 ? styles.riskMedium : styles.riskLow;

  return (
    <header className={`entity-hero ${styles.hero}`}>
      {pageData.parent ? (
        <nav className={`entity-breadcrumb ${styles.breadcrumb}`} aria-label={t("web.entity.breadcrumbAriaLabel")}>
          <Link className="entity-breadcrumb-link" href={parentHref ?? "#"}>
            {pageData.parent.title}
          </Link>
          <span className="entity-breadcrumb-separator" aria-hidden="true">
            →
          </span>
          <span className="entity-breadcrumb-current">{pageData.entity.title}</span>
        </nav>
      ) : null}

      <div className={styles.heroLayout}>
        <div className={styles.heroLead}>
          <EntityAvatar
            canonicalUrl={pageData.entity.canonicalUrl}
            className={styles.avatar}
            entityId={pageData.entity.id}
            logoUrl={pageData.entity.logoUrl}
            size="lg"
            title={pageData.entity.title}
          />
          <div className={styles.identity}>
            <p className="eyebrow">{formatEntityTypeLabel(t, pageData.entity.type)}</p>
            <h1 id="entity-page-heading" title={pageData.entity.title}>
              {displayTitle}
            </h1>
            {description ? (
              <p className={styles.description} title={description}>
                {description}
              </p>
            ) : null}
            {hostname ? <p className={styles.hostname}>{hostname}</p> : null}
          </div>
        </div>

        <div className={styles.metricsColumn} aria-label={t("web.entity.statsAriaLabel")}>
          <div className={styles.scoreBlock}>
            <strong className={styles.scoreValue}>{formatScoreOneDecimal(pageData.rating.avgScore)}</strong>
            <span className={styles.scoreOutOf}>/ 5</span>
            <p className={styles.stars} aria-label={formatStarRating(pageData.rating.avgScore)}>
              {formatStarRating(pageData.rating.avgScore)}
            </p>
          </div>
          <p className={styles.scoreCaption}>{t("web.entity.average")}</p>
          <div className={styles.trustSummary}>
            <div className={styles.trustHeading}>
              <span>{t("rating.dataReliability.label")}</span>
              <strong>{confidencePercent}%</strong>
            </div>
            <div className={styles.trustTrack} aria-hidden="true">
              <span style={{ width: `${confidencePercent}%` }} />
            </div>
            <div className={`${styles.riskRow} ${riskTone ?? ""}`}>
              <span className={styles.riskDot} aria-hidden="true" />
              <span>{t("rating.manipulationRisk.label")}</span>
              <strong>{manipulationRiskPercent}%</strong>
            </div>
          </div>
        </div>

        <div className={styles.artwork} aria-hidden="true">
          <span className={styles.artworkGlow} />
          <EntityAvatar
            canonicalUrl={pageData.entity.canonicalUrl}
            className={styles.artworkAvatar}
            entityId={pageData.entity.id}
            logoUrl={pageData.entity.logoUrl}
            size="lg"
            title={pageData.entity.title}
          />
        </div>
      </div>

      <div className={styles.statStrip}>
        <EntityStat icon="sparkle" label={t("web.entity.average")} value={formatScore(pageData.rating.avgScore)} />
        <EntityStat icon="objects" label={t("web.entity.votes")} value={String(pageData.rating.votesCount)} />
        <EntityStat
          icon="spotlight"
          label={t("web.entity.confidence")}
          value={formatReliabilityPercent(pageData.trust.confidence)}
        />
        <EntityStat
          icon="message"
          label={t("web.entity.reviewsCount")}
          value={String(pageData.meta.reviewsCountGlobal)}
        />
        <EntityStat icon="trophy" label={t("web.nav.globalTops")} value={String(userTopsCount)} />
        <EntityStat
          icon="battle"
          label={t("contributions.relatedPresencesTitle")}
          value={String(pageData.relatedPresences.length)}
        />
      </div>

      <nav className={styles.anchorLinks} aria-label={t("web.entity.heroLinksAriaLabel")}>
        <button
          type="button"
          className={`${styles.anchorLink} ${styles.anchorPrimary}`}
          onClick={() => {
            navigateToEntitySection("entity-rate-form");
          }}
        >
          <OpiniaIcon name="sparkle" />
          {t("growth.hero.rate")}
        </button>
        <button
          type="button"
          className={styles.anchorLink}
          onClick={() => {
            navigateToEntitySection("entity-live-chat");
          }}
        >
          <OpiniaIcon name="message" />
          {t("growth.hero.discuss")}
        </button>
        <button
          type="button"
          className={styles.anchorLink}
          onClick={() => {
            navigateToEntitySection("entity-compare");
          }}
        >
          <OpiniaIcon name="battle" />
          {t("growth.hero.compare")}
        </button>
        {showUserTopsNav ? (
          <button
            type="button"
            className={styles.anchorLink}
            onClick={() => {
              navigateToEntitySection("entity-user-tops");
            }}
          >
            <OpiniaIcon name="trophy" />
            {t("web.userTops.heroLink")}
          </button>
        ) : (
          <Link className={styles.anchorLink} href="/top">
            <OpiniaIcon name="trophy" />
            {t("web.nav.globalTops")}
          </Link>
        )}
        {showRelatedPresencesNav ? (
          <button
            type="button"
            className={styles.anchorLink}
            onClick={() => {
              navigateToEntitySection("entity-related-presences");
            }}
          >
            <OpiniaIcon name="objects" />
            {t("contributions.relatedPresencesTitle")}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.anchorLink}
          onClick={() => {
            navigateToEntitySection("entity-page-footer");
          }}
        >
          <OpiniaIcon name="spotlight" />
          {t("growth.share.button")}
        </button>
      </nav>
    </header>
  );
}

function EntityStat({
  icon,
  label,
  value
}: {
  icon: "battle" | "message" | "objects" | "sparkle" | "spotlight" | "trophy";
  label: string;
  value: string;
}) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statIcon} aria-hidden="true">
        <OpiniaIcon name={icon} />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

function formatReliabilityPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

function formatHostname(canonicalUrl: string | null): string | null {
  if (!canonicalUrl) {
    return null;
  }

  try {
    return new URL(canonicalUrl).hostname;
  } catch {
    return canonicalUrl;
  }
}

function buildEntityHref(entityId: string, returnQuery: string): string {
  const path = `/entities/${entityId}`;

  if (!returnQuery) {
    return path;
  }

  return `${path}?q=${encodeURIComponent(returnQuery)}`;
}
