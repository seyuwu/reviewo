"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslateFn } from "@reviewo/i18n";
import { getCurrentUserProfile } from "../../profile/api/profile";
import {
  fetchEconomyOverview,
  fetchPlatformHealth,
  fetchSpotlightAnalytics,
  fetchTopContributors
} from "../api/admin-economy-api";
import type {
  AdminContributor,
  ContributorScoreBreakdownItem,
  ContributionSourceItem,
  PlatformHealth,
  PlatformMetric,
  SpotlightConversionMetrics,
  SpotlightPlacementType,
  SpotlightTopPlacement,
  SpotlightTypePerformance
} from "../types/admin-economy";
import styles from "./admin-economy-page-view.module.css";

export function AdminEconomyPageView() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const [contributorCursor, setContributorCursor] = useState<string | null>(null);
  const [loadedContributors, setLoadedContributors] = useState<AdminContributor[]>([]);
  const [isLoadingMoreContributors, setIsLoadingMoreContributors] = useState(false);

  const profileQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => getCurrentUserProfile(accessToken ?? ""),
    queryKey: ["profile", "me", accessToken]
  });

  const isAdmin = profileQuery.data?.role === "ADMIN";

  const platformHealthQuery = useQuery({
    enabled: Boolean(accessToken) && isAdmin,
    queryFn: () => fetchPlatformHealth(accessToken ?? ""),
    queryKey: ["admin-economy", "platform-health"]
  });

  const overviewQuery = useQuery({
    enabled: Boolean(accessToken) && isAdmin,
    queryFn: () => fetchEconomyOverview(accessToken ?? ""),
    queryKey: ["admin-economy", "overview"]
  });

  const spotlightQuery = useQuery({
    enabled: Boolean(accessToken) && isAdmin,
    queryFn: () => fetchSpotlightAnalytics(accessToken ?? "", 30),
    queryKey: ["admin-economy", "spotlight"]
  });

  const contributorsQuery = useQuery({
    enabled: Boolean(accessToken) && isAdmin,
    queryFn: () => fetchTopContributors(accessToken ?? "", { limit: 20 }),
    queryKey: ["admin-economy", "contributors"]
  });

  useEffect(() => {
    if (contributorsQuery.data) {
      setLoadedContributors(contributorsQuery.data.items);
      setContributorCursor(contributorsQuery.data.nextCursor);
    }
  }, [contributorsQuery.data]);

  const loadMoreContributors = async () => {
    if (!accessToken || !contributorCursor || isLoadingMoreContributors) {
      return;
    }

    setIsLoadingMoreContributors(true);

    try {
      const response = await fetchTopContributors(accessToken, {
        cursor: contributorCursor,
        limit: 20
      });
      setLoadedContributors((current) => [...current, ...response.items]);
      setContributorCursor(response.nextCursor);
    } finally {
      setIsLoadingMoreContributors(false);
    }
  };

  if (!isAuthSessionLoaded || profileQuery.isLoading) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  if (!authSession) {
    router.replace("/profile");
    return null;
  }

  if (profileQuery.isError || !isAdmin) {
    return (
      <section className="panel-card">
        <h1>{t("admin.accessDeniedTitle")}</h1>
        <p className="muted-copy">{t("admin.accessDeniedBody")}</p>
        <Link className="button-secondary" href="/profile">
          {t("admin.backToProfile")}
        </Link>
      </section>
    );
  }

  return (
    <section className={styles.adminEconomyPage}>
      <header className={styles.adminEconomyHeader}>
        <p className="eyebrow">{t("web.admin.economy.eyebrow")}</p>
        <h1>{t("web.admin.economy.title")}</h1>
        <p className="hero-copy">{t("web.admin.economy.subtitle")}</p>
        <div className={styles.adminEconomyNav}>
          <Link className="button-secondary" href="/admin">
            {t("web.admin.economy.backToAdmin")}
          </Link>
        </div>
      </header>

      <section className={styles.adminEconomySection}>
        <h2>{t("web.admin.economy.platformTitle")}</h2>
        {platformHealthQuery.isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}
        {platformHealthQuery.data ? (
          <PlatformHealthGrid data={platformHealthQuery.data} t={t} />
        ) : null}
      </section>

      <section className={styles.adminEconomySection}>
        <h2>{t("web.admin.economy.funnelTitle")}</h2>
        {overviewQuery.isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}
        {overviewQuery.data ? (
          <>
            <div className={styles.adminEconomyStatsGrid}>
              <StatCard label={t("web.admin.economy.creditsGranted")} value={overviewQuery.data.creditsGranted} />
              <StatCard label={t("web.admin.economy.creditsExpired")} value={overviewQuery.data.creditsExpired} />
              <StatCard label={t("web.admin.economy.creditsSpent")} value={overviewQuery.data.creditsSpent} />
              <StatCard
                label={t("web.admin.economy.usersWithBalance")}
                value={overviewQuery.data.usersWithBalance}
              />
              <StatCard
                label={t("web.admin.economy.usersWithScore")}
                value={overviewQuery.data.usersWithScoreAboveZero}
              />
              <StatCard
                label={t("web.admin.economy.usersContributorPlus")}
                value={overviewQuery.data.usersLevelContributorOrAbove}
              />
              <StatCard
                label={t("web.admin.economy.usersSpotlightEligible")}
                value={overviewQuery.data.usersEligibleForSpotlight}
              />
            </div>
            <div className={styles.adminEconomyLevelList}>
              {overviewQuery.data.usersByLevel.map((row) => (
                <div className={styles.adminEconomyLevelRow} key={row.level}>
                  <span>{formatLevelLabel(row.level, t)}</span>
                  <strong>{row.count}</strong>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      {overviewQuery.data ? (
        <section className={styles.adminEconomySection}>
          <h2>{t("web.admin.economy.sourcesTitle")}</h2>
          <p className="muted-copy">{t("web.admin.economy.sourcesNote")}</p>
          <ContributionSourcesList items={overviewQuery.data.contributionSources} t={t} />
        </section>
      ) : null}

      {platformHealthQuery.data ? (
        <section className={styles.adminEconomySection}>
          <h2>{t("web.admin.economy.contentFunnelTitle")}</h2>
          <p className="muted-copy">
            {t("web.admin.economy.contentFunnelPeriod", {
              days: platformHealthQuery.data.contentFunnel.periodDays
            })}
          </p>
          <ContentFunnelView funnel={platformHealthQuery.data.contentFunnel} t={t} />
        </section>
      ) : null}

      <section className={styles.adminEconomySection}>
        <h2>{t("web.admin.economy.spotlightTitle")}</h2>
        {spotlightQuery.isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}
        {spotlightQuery.data ? (
          <>
            <p className="muted-copy">
              {t("web.admin.economy.spotlightPeriod", { days: spotlightQuery.data.periodDays })}
            </p>
            <div className={styles.adminEconomyTableWrap}>
              <table className={styles.adminEconomyTable}>
                <thead>
                  <tr>
                    <th>{t("web.admin.economy.columnType")}</th>
                    <th>{t("web.admin.economy.columnCreditsSpent")}</th>
                    <th>{t("web.admin.economy.columnPlacements")}</th>
                    <th>{t("web.admin.economy.columnImpressions")}</th>
                    <th>{t("web.admin.economy.columnClicks")}</th>
                    <th>{t("web.admin.economy.columnCtr")}</th>
                    <th>{t("web.admin.economy.columnConversions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {spotlightQuery.data.byType.map((row) => (
                    <SpotlightTypeRow key={row.placementType} row={row} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
            <h3>{t("web.admin.economy.topPlacementsTitle")}</h3>
            <div className={styles.adminEconomyTableWrap}>
              <table className={styles.adminEconomyTable}>
                <thead>
                  <tr>
                    <th>{t("web.admin.economy.columnTitle")}</th>
                    <th>{t("web.admin.economy.columnType")}</th>
                    <th>{t("web.admin.economy.columnImpressions")}</th>
                    <th>{t("web.admin.economy.columnClicks")}</th>
                    <th>{t("web.admin.economy.columnCtr")}</th>
                    <th>{t("web.admin.economy.columnConversions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {spotlightQuery.data.topPlacements.map((row) => (
                    <SpotlightPlacementRow key={row.placementId} row={row} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>

      <section className={styles.adminEconomySection}>
        <h2>{t("web.admin.economy.contributorsTitle")}</h2>
        {contributorsQuery.isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}
        <div className={styles.adminContributorList}>
          {loadedContributors.map((contributor) => (
            <ContributorCard contributor={contributor} key={contributor.userId} t={t} />
          ))}
        </div>
        {contributorCursor ? (
          <button
            className="button-secondary"
            disabled={isLoadingMoreContributors}
            type="button"
            onClick={() => {
              void loadMoreContributors();
            }}
          >
            {isLoadingMoreContributors
              ? t("common.loadingEllipsis")
              : t("web.admin.economy.loadMoreContributors")}
          </button>
        ) : null}
      </section>
    </section>
  );
}

function PlatformHealthGrid({ data, t }: { data: PlatformHealth; t: TranslateFn }) {
  const metrics: Array<{ key: keyof Omit<PlatformHealth, "contentFunnel">; label: string }> = [
    { key: "users", label: t("web.admin.economy.platform.users") },
    { key: "entities", label: t("web.admin.economy.platform.entities") },
    { key: "ratings", label: t("web.admin.economy.platform.ratings") },
    { key: "reviews", label: t("web.admin.economy.platform.reviews") },
    { key: "discussions", label: t("web.admin.economy.platform.discussions") },
    { key: "tops", label: t("web.admin.economy.platform.tops") },
    { key: "battles", label: t("web.admin.economy.platform.battles") }
  ];

  return (
    <div className={styles.adminPlatformHealthGrid}>
      {metrics.map((metric) => (
        <PlatformMetricCard
          key={metric.key}
          label={metric.label}
          metric={data[metric.key]}
          t={t}
        />
      ))}
    </div>
  );
}

function PlatformMetricCard({
  label,
  metric,
  t
}: {
  label: string;
  metric: PlatformMetric;
  t: TranslateFn;
}) {
  return (
    <article className={styles.adminPlatformMetricCard}>
      <p className={styles.adminPlatformMetricLabel}>{label}</p>
      <strong className={styles.adminPlatformMetricValue}>{formatNumber(metric.total)}</strong>
      <p className={styles.adminPlatformMetricDelta}>
        {t("web.admin.economy.platform.delta", {
          day: metric.last1Day,
          month: metric.last30Days,
          week: metric.last7Days
        })}
      </p>
    </article>
  );
}

function ContentFunnelView({
  funnel,
  t
}: {
  funnel: PlatformHealth["contentFunnel"];
  t: TranslateFn;
}) {
  const steps = [
    { isBottleneck: false, label: t("web.admin.economy.funnel.entities"), value: funnel.entitiesCreated },
    {
      isBottleneck: isBottleneck(funnel.entitiesCreated, funnel.ratingsAdded),
      label: t("web.admin.economy.funnel.ratings"),
      value: funnel.ratingsAdded
    },
    {
      isBottleneck: isBottleneck(funnel.ratingsAdded, funnel.reviewsAdded),
      label: t("web.admin.economy.funnel.reviews"),
      value: funnel.reviewsAdded
    },
    {
      isBottleneck: isBottleneck(funnel.reviewsAdded, funnel.discussionsAdded),
      label: t("web.admin.economy.funnel.discussions"),
      value: funnel.discussionsAdded
    },
    {
      isBottleneck: isBottleneck(funnel.discussionsAdded, funnel.topsCreated),
      label: t("web.admin.economy.funnel.tops"),
      value: funnel.topsCreated
    }
  ];

  return (
    <div className={styles.adminContentFunnel}>
      {steps.map((step, index) => (
        <div key={step.label}>
          {index > 0 ? <p className={styles.adminContentFunnelArrow}>↓</p> : null}
          <div
            className={`${styles.adminContentFunnelStep}${step.isBottleneck ? ` ${styles.adminContentFunnelStepBottleneck}` : ""}`}
          >
            <span>{step.label}</span>
            <strong>{formatNumber(step.value)}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

function ContributionSourcesList({
  items,
  t
}: {
  items: ContributionSourceItem[];
  t: TranslateFn;
}) {
  if (items.length === 0) {
    return <p className="muted-copy">{t("web.admin.economy.sourcesEmpty")}</p>;
  }

  return (
    <div className={styles.adminContributionSources}>
      {items.map((item) => (
        <div className={styles.adminContributionSourceRow} key={item.actionType}>
          <div className={styles.adminContributionSourceMeta}>
            <span>{formatActionTypeLabel(item.actionType, t)}</span>
            <span>
              {item.sharePercent}% · {formatNumber(item.points)} pts
            </span>
          </div>
          <div className={styles.adminContributionSourceBar}>
            <div
              className={styles.adminContributionSourceBarFill}
              style={{ width: `${Math.max(item.sharePercent, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel-card">
      <p className="muted-copy">{label}</p>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function SpotlightTypeRow({ row, t }: { row: SpotlightTypePerformance; t: TranslateFn }) {
  return (
    <tr>
      <td>{formatPlacementTypeLabel(row.placementType, t)}</td>
      <td>{formatNumber(row.creditsSpent)}</td>
      <td>{formatNumber(row.placements)}</td>
      <td>{formatNumber(row.impressions)}</td>
      <td>{formatNumber(row.clicks)}</td>
      <td>{formatPercent(row.ctr)}</td>
      <td>{formatConversions(row.conversions, t)}</td>
    </tr>
  );
}

function SpotlightPlacementRow({ row, t }: { row: SpotlightTopPlacement; t: TranslateFn }) {
  return (
    <tr>
      <td>
        <strong>{row.title}</strong>
        <p className="muted-copy">{row.sponsorDisplayName}</p>
      </td>
      <td>{formatPlacementTypeLabel(row.placementType, t)}</td>
      <td>{formatNumber(row.impressions)}</td>
      <td>{formatNumber(row.clicks)}</td>
      <td>{formatPercent(row.ctr)}</td>
      <td>{formatConversions(row.conversions, t)}</td>
    </tr>
  );
}

function ContributorCard({ contributor, t }: { contributor: AdminContributor; t: TranslateFn }) {
  return (
    <article className={styles.adminContributorCard}>
      <div className={styles.adminContributorHeader}>
        <div>
          <strong>{contributor.displayName}</strong>
          <p className="muted-copy">{contributor.userId}</p>
        </div>
        <strong>
          {t("web.admin.economy.scoreLabel", { score: contributor.contributionScore })}
        </strong>
      </div>
      <div className={styles.adminContributorMeta}>
        <span>{formatLevelLabel(contributor.level, t)}</span>
        {contributor.lastActivityAt ? (
          <span>{new Date(contributor.lastActivityAt).toLocaleString()}</span>
        ) : null}
      </div>
      <dl className={styles.adminContributorCounts}>
        <div>
          <dt>{t("web.admin.economy.countRatings")}</dt>
          <dd>{contributor.snapshotCounts.ratingsCount}</dd>
        </div>
        <div>
          <dt>{t("web.admin.economy.countReviews")}</dt>
          <dd>{contributor.snapshotCounts.reviewsCount}</dd>
        </div>
        <div>
          <dt>{t("web.admin.economy.countTops")}</dt>
          <dd>{contributor.snapshotCounts.topsCount}</dd>
        </div>
        <div>
          <dt>{t("web.admin.economy.countFieldFixes")}</dt>
          <dd>{contributor.snapshotCounts.fieldFixesCount}</dd>
        </div>
      </dl>
      <div className={styles.adminContributorBreakdown}>
        {contributor.scoreBreakdown.map((item) => (
          <BreakdownRow item={item} key={item.actionType} t={t} />
        ))}
      </div>
    </article>
  );
}

function BreakdownRow({
  item,
  t
}: {
  item: ContributorScoreBreakdownItem;
  t: TranslateFn;
}) {
  return (
    <div className={styles.adminContributorBreakdownRow}>
      <span>{formatActionTypeLabel(item.actionType, t)}</span>
      <span>
        {t("web.admin.economy.breakdownPoints", {
          count: item.rawCount,
          points: item.points
        })}
      </span>
    </div>
  );
}

function isBottleneck(previous: number, current: number): boolean {
  if (previous < 10) {
    return false;
  }

  return current < previous * 0.2;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatConversions(conversions: SpotlightConversionMetrics, t: TranslateFn): string {
  const parts: string[] = [];

  if (conversions.rating) {
    parts.push(t("web.admin.economy.conversionRating", { count: conversions.rating }));
  }

  if (conversions.review) {
    parts.push(t("web.admin.economy.conversionReview", { count: conversions.review }));
  }

  if (conversions.discussion) {
    parts.push(t("web.admin.economy.conversionDiscussion", { count: conversions.discussion }));
  }

  if (conversions.battleVote) {
    parts.push(t("web.admin.economy.conversionBattleVote", { count: conversions.battleVote }));
  }

  if (conversions.like) {
    parts.push(t("web.admin.economy.conversionLike", { count: conversions.like }));
  }

  if (conversions.fork) {
    parts.push(t("web.admin.economy.conversionFork", { count: conversions.fork }));
  }

  return parts.length > 0 ? parts.join(" · ") : t("web.admin.economy.noConversions");
}

function formatLevelLabel(level: AdminContributor["level"], t: TranslateFn): string {
  switch (level) {
    case "newcomer":
      return t("web.admin.economy.level.newcomer");
    case "contributor":
      return t("web.admin.economy.level.contributor");
    case "active_contributor":
      return t("web.admin.economy.level.activeContributor");
    case "curator":
      return t("web.admin.economy.level.curator");
    case "pioneer":
      return t("web.admin.economy.level.pioneer");
    default:
      return level;
  }
}

function formatPlacementTypeLabel(type: SpotlightPlacementType, t: TranslateFn): string {
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

function formatActionTypeLabel(actionType: string, t: TranslateFn): string {
  switch (actionType) {
    case "rating.created":
      return t("web.admin.economy.action.rating");
    case "review.created":
      return t("web.admin.economy.action.review");
    case "top.created":
      return t("web.admin.economy.action.top");
    case "top.liked":
      return t("web.admin.economy.action.topLiked");
    case "top.forked":
      return t("web.admin.economy.action.topForked");
    case "contribution.approved":
      return t("web.admin.economy.action.fieldFix");
    case "battle.vote":
      return t("web.admin.economy.action.battleVote");
    case "discussion.created":
      return t("web.admin.economy.action.discussion");
    case "entity.created":
      return t("web.admin.economy.action.entity");
    case "other":
      return t("web.admin.economy.action.other");
    default:
      return actionType;
  }
}
