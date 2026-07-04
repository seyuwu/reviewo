"use client";

import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";
import { formatScoreOneDecimal, formatStarRating, formatTrustPercent } from "../lib/format-growth-stats";
import type { GrowthCompareResponse } from "../types/growth";

interface ComparePageViewProps {
  compare: GrowthCompareResponse;
}

export function ComparePageView({ compare }: ComparePageViewProps) {
  const t = useTranslation();

  return (
    <section className="growth-battle-layout ui-fade-in">
      <header className="entity-hero">
        <div>
          <p className="eyebrow">Compare</p>
          <h1>
            {t("growth.compare.title", {
              left: compare.left.entity.title,
              right: compare.right.entity.title
            })}
          </h1>
          <p className="hero-copy">{t("growth.compare.subtitle")}</p>
        </div>
      </header>

      <div className="growth-compare-grid">
        <CompareSide compare={compare.left} />
        <CompareSide compare={compare.right} />
      </div>

      <section className="panel-card">
        <p className="muted-copy">{t("growth.compare.goToBattle")}</p>
        <div className="growth-compare-links">
          <Link className="primary-link" href={`/battle/${compare.pairSlug}`}>
            {compare.left.entity.title} vs {compare.right.entity.title}
          </Link>
        </div>
      </section>
    </section>
  );
}

function CompareSide({ compare }: { compare: GrowthCompareResponse["left"] }) {
  const t = useTranslation();

  return (
    <article className="growth-compare-side panel-card">
      <div className="growth-compare-side-header">
        <h2>{compare.entity.title}</h2>
        <p aria-hidden="true">{formatStarRating(compare.rating.avgScore)}</p>
        <strong>{formatScoreOneDecimal(compare.rating.avgScore)}/5</strong>
      </div>
      <div className="growth-compare-side-stats">
        <span>{formatTrustPercent(compare.trust.confidence)} trust</span>
        <span>{t("growth.compare.votes", { count: String(compare.rating.votesCount) })}</span>
        <span>{t("growth.compare.reviews", { count: String(compare.meta.reviewsCount) })}</span>
      </div>
      <Link className="primary-link" href={`/entities/${compare.entity.id}`}>
        {t("growth.compare.openEntity")}
      </Link>
    </article>
  );
}
