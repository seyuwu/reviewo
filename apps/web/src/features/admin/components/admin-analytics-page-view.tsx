"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { getCurrentUserProfile } from "../../profile/api/profile";
import {
  fetchAdminAnalyticsOverview,
  fetchAdminDotaSearchHistory
} from "../api/admin-analytics-api";
import type { DotaSearchHistoryItem, DotaSearchType } from "../types/admin-analytics";
import styles from "./admin-economy-page-view.module.css";

const RANGE_OPTIONS = [1, 7, 30] as const;

export function AdminAnalyticsPageView() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(7);
  const [searchType, setSearchType] = useState<DotaSearchType>("SOLO");

  const profileQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => getCurrentUserProfile(accessToken ?? ""),
    queryKey: ["profile", "me", accessToken]
  });

  const analyticsQuery = useQuery({
    enabled: Boolean(accessToken) && profileQuery.data?.role === "ADMIN",
    queryFn: () => fetchAdminAnalyticsOverview(accessToken ?? "", days),
    queryKey: ["admin-analytics", "overview", days],
    refetchInterval: 60_000
  });

  const searchHistoryQuery = useQuery({
    enabled: Boolean(accessToken) && profileQuery.data?.role === "ADMIN",
    queryFn: () => fetchAdminDotaSearchHistory(accessToken ?? "", days, searchType),
    queryKey: ["admin-analytics", "dota-search-history", days, searchType],
    refetchInterval: 60_000
  });

  if (!isAuthSessionLoaded) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  if (!accessToken) {
    router.replace("/login");
    return null;
  }

  if (profileQuery.isLoading) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  if (profileQuery.data?.role !== "ADMIN") {
    return <p className="muted-copy">{t("admin.accessDeniedBody")}</p>;
  }

  const data = analyticsQuery.data;

  return (
    <section className={styles.adminEconomyPage}>
      <header className={styles.adminEconomyHeader}>
        <p className="eyebrow">{t("web.admin.analytics.eyebrow")}</p>
        <h1>{t("web.admin.analytics.title")}</h1>
        <p className="hero-copy">{t("web.admin.analytics.subtitle")}</p>
        <div className={styles.adminEconomyNav}>
          <Link className="button-secondary" href="/admin">
            {t("web.admin.economy.backToAdmin")}
          </Link>
          <Link className="button-secondary" href="/admin/economy">
            {t("web.admin.economy.openPanel")}
          </Link>
          <Link className="button-secondary" href="/admin/games-launch">
            {t("web.admin.gamesLaunch.openPanel")}
          </Link>
        </div>
      </header>

      <div className={styles.adminEconomyNav}>
        {RANGE_OPTIONS.map((option) => (
          <button
            className={option === days ? "button-primary" : "button-secondary"}
            key={option}
            onClick={() => setDays(option)}
            type="button"
          >
            {t("web.admin.analytics.rangeDays", { days: String(option) })}
          </button>
        ))}
      </div>

      {analyticsQuery.isLoading ? (
        <p className="muted-copy">{t("common.loadingEllipsis")}</p>
      ) : null}
      {analyticsQuery.isError ? (
        <p className="muted-copy">{t("web.admin.analytics.loadError")}</p>
      ) : null}

      {data ? (
        <>
          <section className={styles.adminEconomySection}>
            <h2>{t("web.admin.analytics.platformTitle")}</h2>
            <div className={styles.adminEconomyStatsGrid}>
              <StatCard
                label={t("web.admin.analytics.platformAccounts")}
                value={data.platformTotals.accounts}
              />
              <StatCard
                label={t("web.admin.analytics.platformAccountsCreated", {
                  days: String(data.rangeDays)
                })}
                value={data.platformTotals.accountsCreatedInRange}
              />
              <StatCard
                label={t("web.admin.analytics.platformActiveAccounts")}
                value={data.platformTotals.activeAccounts}
              />
              <StatCard
                label={t("web.admin.analytics.platformDotaProfiles")}
                value={data.platformTotals.dotaProfiles}
              />
              <StatCard
                label={t("web.admin.analytics.platformDotaParties")}
                value={data.platformTotals.dotaParties}
              />
              <StatCard
                label={t("web.admin.analytics.platformActiveDotaParties")}
                value={data.platformTotals.activeDotaParties}
              />
            </div>
          </section>

          <section className={styles.adminEconomySection}>
            <h2>{t("web.admin.analytics.telegramTitle")}</h2>
            <p className="muted-copy">{t("web.admin.analytics.telegramHint")}</p>
            <div className={styles.adminEconomyStatsGrid}>
              <StatCard
                label={t("web.admin.analytics.telegramAccounts")}
                value={data.telegramBot.accounts}
              />
              <StatCard
                label={t("web.admin.analytics.telegramNewAccounts", {
                  days: String(data.rangeDays)
                })}
                value={data.telegramBot.accountsConnectedInRange}
              />
              <StatCard
                label={t("web.admin.analytics.telegramSearching")}
                value={data.telegramBot.activeSearchUsers}
              />
              <StatCard
                label={t("web.admin.analytics.telegramSoloSearch")}
                value={data.telegramBot.soloSearchUsers}
              />
              <StatCard
                label={t("web.admin.analytics.telegramRecruitingParties")}
                value={data.telegramBot.recruitingParties}
              />
              <StatCard
                label={t("web.admin.analytics.telegramOpenSlots")}
                value={data.telegramBot.openSlots}
              />
            </div>
          </section>

          <section className={styles.adminEconomySection}>
            <h2>{t("web.admin.analytics.searchHistoryTitle")}</h2>
            <p className="muted-copy">{t("web.admin.analytics.searchHistoryHint")}</p>
            <div className={styles.adminEconomyNav}>
              {(
                [
                  ["SOLO", "web.admin.analytics.searchHistorySolo"],
                  ["RECRUIT", "web.admin.analytics.searchHistoryRecruit"]
                ] as const
              ).map(([type, labelKey]) => (
                <button
                  aria-pressed={searchType === type}
                  className={searchType === type ? "button-primary" : "button-secondary"}
                  key={type}
                  onClick={() => setSearchType(type)}
                  type="button"
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
            <div className={styles.adminEconomyNav}>
              <span className={styles.searchHistoryLegendItem}>
                <i className={styles.searchHistoryJoinedMark} />
                {t("web.admin.analytics.searchHistoryFound")}
              </span>
              <span className={styles.searchHistoryLegendItem}>
                <i className={styles.searchHistoryMissedMark} />
                {t("web.admin.analytics.searchHistoryNotFound")}
              </span>
              <span className={styles.searchHistoryLegendItem}>
                <i className={styles.searchHistoryActiveMark} />
                {t("web.admin.analytics.searchHistoryActive")}
              </span>
            </div>
            {searchHistoryQuery.isLoading ? (
              <p className="muted-copy">{t("common.loadingEllipsis")}</p>
            ) : searchHistoryQuery.isError ? (
              <p className="muted-copy">{t("web.admin.analytics.loadError")}</p>
            ) : searchHistoryQuery.data?.length ? (
              <>
                <p className="muted-copy">
                  {t("web.admin.analytics.searchHistoryCount", {
                    count: String(searchHistoryQuery.data.length)
                  })}
                </p>
                <DotaSearchHistoryChart
                  items={searchHistoryQuery.data}
                  labels={{
                    chart: t("web.admin.analytics.searchHistoryChart"),
                    active: t("web.admin.analytics.searchHistoryActive"),
                    found: t("web.admin.analytics.searchHistoryFound"),
                    notFound: t("web.admin.analytics.searchHistoryNotFound"),
                    duration: t("web.admin.analytics.searchHistoryDuration")
                  }}
                />
                <div className={styles.adminEconomyTableWrap}>
                  <table className={styles.adminEconomyTable}>
                    <thead>
                      <tr>
                        <th>{t("web.admin.analytics.searchHistoryPlayer")}</th>
                        <th>{t("web.admin.analytics.searchHistoryStarted")}</th>
                        <th>{t("web.admin.analytics.searchHistoryDuration")}</th>
                        <th>{t("web.admin.analytics.searchHistoryResult")}</th>
                        <th>{t("web.admin.analytics.searchHistorySource")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchHistoryQuery.data.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.userName}</strong>
                            {item.partyName ? (
                              <div className="muted-copy">{item.partyName}</div>
                            ) : null}
                          </td>
                          <td>{formatSearchDate(item.startedAt)}</td>
                          <td>{formatDuration(item.durationSeconds)}</td>
                          <td>
                            {item.status === "JOINED"
                              ? item.searchType === "RECRUIT"
                                ? t("web.admin.analytics.searchHistoryFoundPlayers", {
                                    count: String(item.matchedCount)
                                  })
                                : t("web.admin.analytics.searchHistoryFound")
                              : item.status === "ACTIVE"
                                ? t("web.admin.analytics.searchHistoryActive")
                                : t("web.admin.analytics.searchHistoryNotFound")}
                          </td>
                          <td>
                            {t(`web.admin.analytics.searchHistorySource.${item.source}` as never)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="muted-copy">{t("web.admin.analytics.searchHistoryEmpty")}</p>
            )}
          </section>

          <section className={styles.adminEconomySection}>
            <h2>{t("web.admin.analytics.totalsTitle")}</h2>
            <div className={styles.adminEconomyStatsGrid}>
              <StatCard
                label={t("web.admin.analytics.uniqueVisitorDays")}
                value={data.totals.uniqueVisitorDays}
              />
              <StatCard
                label={t("web.admin.analytics.avgDailyUniques")}
                value={data.totals.avgDailyUniques ?? "—"}
              />
              <StatCard label={t("web.admin.analytics.pageviews")} value={data.totals.pageviews} />
              <StatCard
                label={t("web.admin.analytics.registrations")}
                value={data.totals.registrations}
              />
              <StatCard
                label={t("web.admin.analytics.avgTime")}
                value={
                  data.totals.avgSecondsOnSite === null
                    ? "—"
                    : formatDuration(data.totals.avgSecondsOnSite)
                }
              />
            </div>
            <p className="muted-copy">{t("web.admin.analytics.uniquesHint")}</p>
          </section>

          <section className={styles.adminEconomySection}>
            <h2>{t("web.admin.analytics.funnelTitle")}</h2>
            <p className="muted-copy">{t("web.admin.analytics.funnelHint")}</p>
            <ol className={styles.adminEconomyStatsGrid}>
              {(
                [
                  ["funnel_home", "web.admin.analytics.funnel.home"],
                  ["funnel_games", "web.admin.analytics.funnel.games"],
                  ["funnel_dota", "web.admin.analytics.funnel.dota"],
                  ["funnel_register", "web.admin.analytics.funnel.register"],
                  ["funnel_dota_profile", "web.admin.analytics.funnel.dotaProfile"]
                ] as const
              ).map(([key, labelKey]) => (
                <li key={key}>
                  <StatCard label={t(labelKey)} value={data.funnel[key] ?? 0} />
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.adminEconomySection}>
            <h2>{t("web.admin.analytics.ctaTitle")}</h2>
            <p className="muted-copy">{t("web.admin.analytics.ctaHint")}</p>
            {data.topCtas.length === 0 ? (
              <p className="muted-copy">{t("web.admin.analytics.empty")}</p>
            ) : (
              <div className={styles.adminEconomyTableWrap}>
                <table className={styles.adminEconomyTable}>
                  <thead>
                    <tr>
                      <th>{t("web.admin.analytics.columnCta")}</th>
                      <th>{t("web.admin.analytics.columnClicks")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCtas.map((row) => (
                      <tr key={row.ctaKey}>
                        <td>{t(`web.admin.analytics.cta.${row.ctaKey}` as never)}</td>
                        <td>{row.clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.adminEconomySection}>
            <h2>{t("web.admin.analytics.timeTitle")}</h2>
            <p className="muted-copy">{t("web.admin.analytics.timeHint")}</p>
            {data.averagesByPath.length === 0 ? (
              <p className="muted-copy">{t("web.admin.analytics.empty")}</p>
            ) : (
              <div className={styles.adminEconomyTableWrap}>
                <table className={styles.adminEconomyTable}>
                  <thead>
                    <tr>
                      <th>{t("web.admin.analytics.columnPath")}</th>
                      <th>{t("web.admin.analytics.columnAvgTime")}</th>
                      <th>{t("web.admin.analytics.columnSamples")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.averagesByPath.map((row) => (
                      <tr key={row.pathKey}>
                        <td>{t(`web.admin.analytics.path.${row.pathKey}` as never)}</td>
                        <td>{formatDuration(row.avgSeconds)}</td>
                        <td>{row.samples}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.adminEconomySection}>
            <h2>{t("web.admin.analytics.byDayTitle")}</h2>
            <div className={styles.adminEconomyTableWrap}>
              <table className={styles.adminEconomyTable}>
                <thead>
                  <tr>
                    <th>{t("web.admin.analytics.columnDay")}</th>
                    <th>{t("web.admin.analytics.uniques")}</th>
                    <th>{t("web.admin.analytics.pageviews")}</th>
                    <th>{t("web.admin.analytics.registrations")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.byDay].reverse().map((row) => (
                    <tr key={row.day}>
                      <td>{row.day}</td>
                      <td>{row.uniques}</td>
                      <td>{row.pageviews}</td>
                      <td>{row.registrations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className={styles.adminPlatformMetricCard}>
      <span className={styles.adminPlatformMetricLabel}>{label}</span>
      <strong className={styles.adminPlatformMetricValue}>{value}</strong>
    </article>
  );
}

function DotaSearchHistoryChart({
  items,
  labels
}: {
  items: DotaSearchHistoryItem[];
  labels: {
    chart: string;
    duration: string;
    active: string;
    found: string;
    notFound: string;
  };
}) {
  const width = 920;
  const height = 280;
  const margin = { bottom: 38, left: 58, right: 18, top: 18 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const sortedItems = [...items].sort(
    (left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt)
  );
  const timestamps = sortedItems.map((item) => Date.parse(item.startedAt));
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const maxDuration = Math.max(60, ...sortedItems.map((item) => item.durationSeconds));
  const points = sortedItems.map((item, index) => ({
    item,
    x:
      margin.left +
      (maxTime === minTime
        ? plotWidth / 2
        : ((timestamps[index]! - minTime) / (maxTime - minTime)) * plotWidth),
    y: margin.top + plotHeight - (item.durationSeconds / maxDuration) * plotHeight
  }));
  const colorFor = (status: DotaSearchHistoryItem["status"]) =>
    status === "JOINED" ? "#22c55e" : status === "ACTIVE" ? "#94a3b8" : "#ef4444";

  return (
    <div className={styles.searchHistoryChartWrap}>
      <svg
        aria-label={labels.chart}
        className={styles.searchHistoryChart}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = margin.top + plotHeight * (1 - fraction);
          const seconds = Math.round(maxDuration * fraction);
          return (
            <g key={fraction}>
              <line
                className={styles.searchHistoryChartGrid}
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
              />
              <text
                className={styles.searchHistoryChartLabel}
                textAnchor="end"
                x={margin.left - 8}
                y={y + 4}
              >
                {formatDuration(seconds)}
              </text>
            </g>
          );
        })}
        {points.slice(1).map((point, index) => {
          const previous = points[index]!;
          return (
            <line
              key={`${previous.item.id}-${point.item.id}`}
              stroke={colorFor(point.item.status)}
              strokeLinecap="round"
              strokeWidth="2.5"
              x1={previous.x}
              x2={point.x}
              y1={previous.y}
              y2={point.y}
            />
          );
        })}
        {points.map(({ item, x, y }) => (
          <circle cx={x} cy={y} fill={colorFor(item.status)} key={item.id} r="5">
            <title>
              {`${item.userName}${item.partyName ? ` · ${item.partyName}` : ""} · ${formatSearchDate(item.startedAt)} · ${formatDuration(item.durationSeconds)} · ${item.status === "JOINED" ? labels.found : item.status === "ACTIVE" ? labels.active : labels.notFound}`}
            </title>
          </circle>
        ))}
        <text
          className={styles.searchHistoryChartLabel}
          textAnchor="middle"
          transform={`translate(14 ${margin.top + plotHeight / 2}) rotate(-90)`}
        >
          {labels.duration}
        </text>
        <text
          className={styles.searchHistoryChartLabel}
          textAnchor="start"
          x={margin.left}
          y={height - 8}
        >
          {formatSearchDate(new Date(minTime).toISOString())}
        </text>
        <text
          className={styles.searchHistoryChartLabel}
          textAnchor="end"
          x={width - margin.right}
          y={height - 8}
        >
          {formatSearchDate(new Date(maxTime).toISOString())}
        </text>
      </svg>
    </div>
  );
}

function formatSearchDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  });
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
