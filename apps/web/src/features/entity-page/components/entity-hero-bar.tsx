"use client";

import Link from "next/link";

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
}

export function EntityHeroBar({
  pageData,
  returnQuery,
  showRelatedPresencesNav = false,
  showUserTopsNav = false
}: EntityHeroBarProps) {
  const t = useTranslation();
  const parentHref = pageData.parent ? buildEntityHref(pageData.parent.id, returnQuery) : null;
  const hostname = formatHostname(pageData.entity.canonicalUrl);
  const displayTitle = formatEntityHeroTitle(pageData.entity);
  const description = pageData.entity.description?.trim() ?? "";

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
            <p className={styles.stars} aria-hidden="true">
              {formatStarRating(pageData.rating.avgScore)}
            </p>
            <strong className={styles.scoreValue}>{formatScoreOneDecimal(pageData.rating.avgScore)}/5</strong>
          </div>

          <div className={`entity-stat-grid ${styles.statGrid}`}>
            <EntityStat label={t("web.entity.average")} value={formatScore(pageData.rating.avgScore)} />
            <EntityStat label={t("web.entity.votes")} value={String(pageData.rating.votesCount)} />
            <EntityStat
              label={t("web.entity.confidence")}
              value={formatReliabilityPercent(pageData.trust.confidence)}
            />
            <EntityStat label={t("web.entity.reviewsCount")} value={String(pageData.meta.reviewsCountGlobal)} />
          </div>
        </div>
      </div>

      <nav className={styles.anchorLinks} aria-label={t("web.entity.heroLinksAriaLabel")}>
        {showRelatedPresencesNav ? (
          <button
            type="button"
            className={styles.anchorLink}
            onClick={() => {
              navigateToEntitySection("entity-related-presences");
            }}
          >
            {t("contributions.relatedPresencesTitle")}
          </button>
        ) : null}
        <Link className={styles.anchorLink} href="/top">
          {t("web.nav.globalTops")}
        </Link>
        <button
          type="button"
          className={styles.anchorLink}
          onClick={() => {
            navigateToEntitySection("entity-live-chat");
          }}
        >
          {t("growth.hero.discuss")}
        </button>
        <button
          type="button"
          className={styles.anchorLink}
          onClick={() => {
            navigateToEntitySection("entity-compare");
          }}
        >
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
            {t("web.userTops.heroLink")}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.anchorLink}
          onClick={() => {
            navigateToEntitySection("entity-page-footer");
          }}
        >
          {t("growth.share.button")}
        </button>
        <button
          type="button"
          className={styles.anchorLink}
          onClick={() => {
            navigateToEntitySection("entity-rate-form");
          }}
        >
          {t("growth.hero.rate")}
        </button>
      </nav>
    </header>
  );
}

function EntityStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="entity-stat-card">
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
