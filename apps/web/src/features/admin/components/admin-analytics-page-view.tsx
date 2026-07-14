"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { getCurrentUserProfile } from "../../profile/api/profile";
import { fetchAdminAnalyticsOverview } from "../api/admin-analytics-api";
import styles from "./admin-economy-page-view.module.css";

const RANGE_OPTIONS = [1, 7, 30] as const;

export function AdminAnalyticsPageView() {
  const t = useTranslation();
  const router = useRouter();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const [days, setDays] = useState<(typeof RANGE_OPTIONS)[number]>(7);

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

      {analyticsQuery.isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}
      {analyticsQuery.isError ? (
        <p className="muted-copy">{t("web.admin.analytics.loadError")}</p>
      ) : null}

      {data ? (
        <>
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

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
