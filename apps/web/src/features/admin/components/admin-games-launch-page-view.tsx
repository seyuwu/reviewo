"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { getCurrentUserProfile } from "../../profile/api/profile";
import {
  fetchAdminGamesLaunchInterests,
  fetchAdminGamesLaunchMetrics,
  fetchAdminGamesLaunchSuggestions
} from "../api/admin-games-launch-api";
import { AdminGamesLaunchToggle } from "./admin-games-launch-toggle";
import styles from "./admin-economy-page-view.module.css";

const RANGE_OPTIONS = [1, 7, 30] as const;

export function AdminGamesLaunchPageView() {
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

  const isAdmin = profileQuery.data?.role === "ADMIN";

  const interestsQuery = useQuery({
    enabled: Boolean(accessToken) && isAdmin,
    queryFn: () => fetchAdminGamesLaunchInterests(accessToken ?? "", 100),
    queryKey: ["admin-games-launch", "interests"],
    refetchInterval: 30_000
  });

  const suggestionsQuery = useQuery({
    enabled: Boolean(accessToken) && isAdmin,
    queryFn: () => fetchAdminGamesLaunchSuggestions(accessToken ?? "", 100),
    queryKey: ["admin-games-launch", "suggestions"],
    refetchInterval: 30_000
  });

  const metricsQuery = useQuery({
    enabled: Boolean(accessToken) && isAdmin,
    queryFn: () => fetchAdminGamesLaunchMetrics(accessToken ?? "", days),
    queryKey: ["admin-games-launch", "metrics", days],
    refetchInterval: 30_000
  });

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

  const sheetsConfigured =
    interestsQuery.data?.sheetsConfigured ?? suggestionsQuery.data?.sheetsConfigured ?? false;
  const metrics = metricsQuery.data;

  return (
    <section className={styles.adminEconomyPage}>
      <header className={styles.adminEconomyHeader}>
        <p className="eyebrow">{t("web.admin.gamesLaunch.eyebrow")}</p>
        <h1>{t("web.admin.gamesLaunch.title")}</h1>
        <p className="hero-copy">{t("web.admin.gamesLaunch.subtitle")}</p>
        <div className={styles.adminEconomyNav}>
          <Link className="button-secondary" href="/admin">
            {t("web.admin.economy.backToAdmin")}
          </Link>
          <Link className="button-secondary" href="/admin/economy">
            {t("web.admin.economy.openPanel")}
          </Link>
          <Link className="button-secondary" href="/admin/analytics">
            {t("web.admin.analytics.openPanel")}
          </Link>
        </div>
      </header>

      <section className={styles.adminEconomySection}>
        <AdminGamesLaunchToggle />
      </section>

      <section className={styles.adminEconomySection}>
        <h2>{t("web.admin.gamesLaunch.metricsTitle")}</h2>
        <p className="muted-copy">{t("web.admin.gamesLaunch.metricsHint")}</p>
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
        {metricsQuery.isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}
        {metricsQuery.isError ? (
          <p className="muted-copy">{t("web.admin.gamesLaunch.metricsError")}</p>
        ) : null}
        {metrics ? (
          <div className={styles.adminEconomyStatsGrid}>
            <StatCard
              label={t("web.admin.gamesLaunch.metricUniques")}
              value={metrics.dotaHostUniques}
            />
            <StatCard
              label={t("web.admin.gamesLaunch.metricPageviews")}
              value={metrics.dotaHostPageviews}
            />
            <StatCard
              label={t("web.admin.gamesLaunch.metricFormStarts")}
              value={metrics.formStarts}
            />
            <StatCard
              label={t("web.admin.gamesLaunch.metricSubmits")}
              value={metrics.interestSubmits}
            />
            <StatCard
              label={t("web.admin.gamesLaunch.metricConvForm")}
              value={formatPct(metrics.conversionFormStartPct)}
            />
            <StatCard
              label={t("web.admin.gamesLaunch.metricConvSubmit")}
              value={formatPct(metrics.conversionSubmitPct)}
            />
            <StatCard
              label={t("web.admin.gamesLaunch.metricInviteClicks")}
              value={metrics.inviteClicks}
            />
            <StatCard
              label={t("web.admin.gamesLaunch.metricInviteVisits")}
              value={metrics.inviteVisits}
            />
            <StatCard
              label={t("web.admin.gamesLaunch.metricCreateProfile")}
              value={metrics.createProfileClicks}
            />
            <StatCard
              label={t("web.admin.gamesLaunch.metricProfileShare")}
              value={metrics.profileShareClicks}
            />
          </div>
        ) : null}
      </section>

      <section className={styles.adminEconomySection}>
        <h2>{t("web.admin.gamesLaunch.sheetsTitle")}</h2>
        <p className="muted-copy">
          {sheetsConfigured
            ? t("web.admin.gamesLaunch.sheetsReady")
            : t("web.admin.gamesLaunch.sheetsMissing")}
        </p>
      </section>

      <section className={styles.adminEconomySection}>
        <h2>
          {t("web.admin.gamesLaunch.interestsTitle", {
            count: String(interestsQuery.data?.total ?? 0)
          })}
        </h2>
        {interestsQuery.isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}
        {interestsQuery.isError ? (
          <p className="muted-copy">{t("web.admin.gamesLaunch.loadError")}</p>
        ) : null}
        {interestsQuery.data?.items.length === 0 ? (
          <p className="muted-copy">{t("web.admin.gamesLaunch.emptyInterests")}</p>
        ) : null}
        {interestsQuery.data && interestsQuery.data.items.length > 0 ? (
          <div className={styles.adminEconomyTableWrap}>
            <table className={styles.adminEconomyTable}>
              <thead>
                <tr>
                  <th>{t("web.admin.gamesLaunch.columnWhen")}</th>
                  <th>{t("web.admin.gamesLaunch.columnChannel")}</th>
                  <th>{t("web.admin.gamesLaunch.columnContact")}</th>
                  <th>{t("web.admin.gamesLaunch.columnUser")}</th>
                </tr>
              </thead>
              <tbody>
                {interestsQuery.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatWhen(item.createdAt)}</td>
                    <td>{item.channel}</td>
                    <td>{item.contact}</td>
                    <td>{item.userId ? item.userId.slice(0, 8) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className={styles.adminEconomySection}>
        <h2>
          {t("web.admin.gamesLaunch.suggestionsTitle", {
            count: String(suggestionsQuery.data?.total ?? 0)
          })}
        </h2>
        {suggestionsQuery.isLoading ? (
          <p className="muted-copy">{t("common.loadingEllipsis")}</p>
        ) : null}
        {suggestionsQuery.isError ? (
          <p className="muted-copy">{t("web.admin.gamesLaunch.loadError")}</p>
        ) : null}
        {suggestionsQuery.data?.items.length === 0 ? (
          <p className="muted-copy">{t("web.admin.gamesLaunch.emptySuggestions")}</p>
        ) : null}
        {suggestionsQuery.data && suggestionsQuery.data.items.length > 0 ? (
          <div className={styles.adminEconomyTableWrap}>
            <table className={styles.adminEconomyTable}>
              <thead>
                <tr>
                  <th>{t("web.admin.gamesLaunch.columnWhen")}</th>
                  <th>{t("web.admin.gamesLaunch.columnSource")}</th>
                  <th>{t("web.admin.gamesLaunch.columnBody")}</th>
                  <th>{t("web.admin.gamesLaunch.columnContact")}</th>
                </tr>
              </thead>
              <tbody>
                {suggestionsQuery.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatWhen(item.createdAt)}</td>
                    <td>{item.source}</td>
                    <td>{item.body}</td>
                    <td>{item.contact?.trim() ? item.contact : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number | string | null | undefined }) {
  return (
    <div className="panel-card">
      <p className="muted-copy">{label}</p>
      <strong>{value ?? 0}</strong>
    </div>
  );
}

function formatPct(value: number | null): string {
  if (value === null) {
    return "—";
  }

  return `${value}%`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}
