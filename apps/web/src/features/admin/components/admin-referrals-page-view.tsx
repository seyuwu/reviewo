"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { useTranslation } from "../../i18n/locale-provider";
import { getCurrentUserProfile } from "../../profile/api/profile";
import { fetchReferralInvitees, fetchReferralLeaderboard } from "../api/admin-referrals-api";
import type { ReferralLeader } from "../types/admin-referrals";
import layout from "./admin-economy-page-view.module.css";
import styles from "./admin-referrals-page-view.module.css";

function dateRange(days: number) {
  const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString().slice(0, 10), to: today };
}
function when(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow"
  }).format(new Date(value));
}

export function AdminReferralsPageView() {
  const t = useTranslation();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const token = authSession?.accessToken;
  const profile = useQuery({
    queryKey: ["profile", "me", token],
    queryFn: () => getCurrentUserProfile(token ?? ""),
    enabled: !!token
  });
  const [range, setRange] = useState(() => dateRange(30));
  const [draft, setDraft] = useState(range);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ReferralLeader | null>(null);
  const [detailOffset, setDetailOffset] = useState(0);
  const [rangeError, setRangeError] = useState(false);
  const isAdmin = profile.data?.role === "ADMIN";
  const ranking = useQuery({
    queryKey: ["admin-referrals", token, range, offset],
    enabled: !!token && isAdmin,
    queryFn: () => fetchReferralLeaderboard(token ?? "", range.from, range.to, offset),
    refetchInterval: 60000
  });
  const details = useQuery({
    queryKey: ["admin-referral-invitees", token, selected?.inviterTelegramId, range, detailOffset],
    enabled: !!token && isAdmin && !!selected,
    queryFn: () =>
      fetchReferralInvitees(
        token ?? "",
        selected?.inviterTelegramId ?? "",
        range.from,
        range.to,
        detailOffset
      ),
    refetchInterval: 60000
  });
  if (!isAuthSessionLoaded || profile.isLoading)
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  if (!token)
    return (
      <section className={layout.adminEconomyPage}>
        <Link className="button-primary" href="/login">
          {t("web.admin.referrals.login")}
        </Link>
      </section>
    );
  if (!isAdmin) return <p className="muted-copy">{t("admin.accessDeniedBody")}</p>;

  function apply(next: { from: string; to: string }) {
    const span = Date.parse(next.to) - Date.parse(next.from);
    if (!Number.isFinite(span) || span < 0 || span >= 366 * 86400000) {
      setRangeError(true);
      return;
    }
    setRangeError(false);
    setRange(next);
    setDraft(next);
    setOffset(0);
    setSelected(null);
    setDetailOffset(0);
  }
  const data = ranking.data;
  return (
    <section className={layout.adminEconomyPage}>
      <header className={layout.adminEconomyHeader}>
        <p className="eyebrow">FDP · Telegram</p>
        <h1>{t("web.admin.referrals.title")}</h1>
        <p className="hero-copy">{t("web.admin.referrals.subtitle")}</p>
        <div className={layout.adminEconomyNav}>
          <Link className="button-secondary" href="/admin">
            {t("web.admin.economy.backToAdmin")}
          </Link>
          <Link className="button-secondary" href="/admin/analytics">
            {t("web.admin.analytics.openPanel")}
          </Link>
        </div>
      </header>
      <section
        className={`panel-card ${styles.filters}`}
        aria-label={t("web.admin.referrals.period")}
      >
        <div className={layout.adminEconomyNav}>
          {[1, 7, 30, 90].map((days) => (
            <button
              type="button"
              key={days}
              className="button-secondary"
              onClick={() => apply(dateRange(days))}
            >
              {t("web.admin.analytics.rangeDays", { days: String(days) })}
            </button>
          ))}
        </div>
        <form
          className={styles.dateForm}
          onSubmit={(event) => {
            event.preventDefault();
            apply(draft);
          }}
        >
          <label>
            {t("web.admin.referrals.from")}
            <input
              type="date"
              required
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </label>
          <label>
            {t("web.admin.referrals.to")}
            <input
              type="date"
              required
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </label>
          <button className="button-primary" type="submit">
            {t("web.admin.referrals.apply")}
          </button>
          <button
            className="button-secondary"
            type="button"
            disabled={ranking.isFetching}
            onClick={() => {
              void ranking.refetch();
              if (selected) void details.refetch();
            }}
          >
            {t("web.admin.referrals.refresh")}
          </button>
        </form>
        <p className="muted-copy">{t("web.admin.referrals.periodHint")}</p>
        {rangeError && (
          <p role="alert" className={styles.error}>
            {t("web.admin.referrals.rangeError")}
          </p>
        )}
      </section>
      {ranking.isLoading && <p aria-live="polite">{t("common.loadingEllipsis")}</p>}
      {ranking.isError && <p role="alert">{t("web.admin.analytics.loadError")}</p>}
      {data && (
        <>
          <div className={layout.adminEconomyStatsGrid}>
            {(
              [
                ["web.admin.referrals.newUsers", data.totals.invited],
                ["web.admin.referrals.inviters", data.totals.inviters],
                ["web.admin.referrals.accounts", data.totals.accounts],
                ["web.admin.referrals.createdAccounts", data.totals.createdAccounts],
                ["web.admin.referrals.searched", data.totals.searched],
                ["web.admin.referrals.joined", data.totals.joined]
              ] as const
            ).map(([key, value]) => (
              <div className={`panel-card ${styles.stat}`} key={key}>
                <p className="muted-copy">{t(key)}</p>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <section className={`panel-card ${styles.section}`}>
            <div className={styles.sectionHeading}>
              <h2>{t("web.admin.referrals.top")}</h2>
              <span className="muted-copy">
                {range.from} — {range.to}
              </span>
            </div>
            <p className="muted-copy">{t("web.admin.referrals.countHint")}</p>
            {data.items.length === 0 ? (
              <div className={styles.empty}>
                <h3>{t("web.admin.referrals.emptyTitle")}</h3>
                <p className="muted-copy">{t("web.admin.referrals.emptyHint")}</p>
              </div>
            ) : (
              <div className={layout.adminEconomyTableWrap}>
                <table className={layout.adminEconomyTable}>
                  <caption className={styles.srOnly}>{t("web.admin.referrals.top")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">{t("web.admin.referrals.player")}</th>
                      <th scope="col">{t("web.admin.referrals.newUsers")}</th>
                      <th scope="col">{t("web.admin.referrals.accounts")}</th>
                      <th scope="col">{t("web.admin.referrals.searched")}</th>
                      <th scope="col">{t("web.admin.referrals.joined")}</th>
                      <th scope="col">{t("web.admin.referrals.details")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row, index) => (
                      <tr key={row.inviterTelegramId}>
                        <td>{offset + index + 1}</td>
                        <td>
                          <strong>{row.displayName}</strong>
                          {row.telegramUsername && (
                            <a
                              className={styles.telegram}
                              href={`https://t.me/${encodeURIComponent(row.telegramUsername)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              @{row.telegramUsername}
                            </a>
                          )}
                        </td>
                        <td className={styles.number}>{row.invited}</td>
                        <td>{row.accounts}</td>
                        <td>{row.searched}</td>
                        <td>{row.joined}</td>
                        <td>
                          <button
                            className="button-secondary"
                            type="button"
                            aria-pressed={selected?.inviterTelegramId === row.inviterTelegramId}
                            onClick={() => {
                              setSelected(row);
                              setDetailOffset(0);
                            }}
                          >
                            {t("web.admin.referrals.showPeople")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager
              offset={offset}
              total={data.totals.inviters}
              size={data.pageSize}
              onChange={setOffset}
            />
          </section>
        </>
      )}
      {selected && (
        <section className={`panel-card ${styles.section}`} aria-live="polite">
          <div className={styles.sectionHeading}>
            <h2>{t("web.admin.referrals.invitedBy", { name: selected.displayName })}</h2>
            <button className="button-secondary" type="button" onClick={() => setSelected(null)}>
              {t("web.admin.referrals.close")}
            </button>
          </div>
          {details.isLoading && <p>{t("common.loadingEllipsis")}</p>}
          {details.isError && <p role="alert">{t("web.admin.analytics.loadError")}</p>}
          {details.data && (
            <>
              <div className={layout.adminEconomyTableWrap}>
                <table className={layout.adminEconomyTable}>
                  <thead>
                    <tr>
                      <th scope="col">{t("web.admin.referrals.player")}</th>
                      <th scope="col">{t("web.admin.referrals.started")}</th>
                      <th scope="col">{t("web.admin.referrals.account")}</th>
                      <th scope="col">{t("web.admin.referrals.search")}</th>
                      <th scope="col">{t("web.admin.referrals.party")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.data.items.map((row) => (
                      <tr key={row.inviteeTelegramId}>
                        <td>
                          {row.displayName}
                          {row.telegramUsername && (
                            <a
                              className={styles.telegram}
                              href={`https://t.me/${encodeURIComponent(row.telegramUsername)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              @{row.telegramUsername}
                            </a>
                          )}
                        </td>
                        <td>{when(row.startedAt)}</td>
                        <td>
                          {row.accountCreatedAt
                            ? t("web.admin.referrals.created")
                            : row.accountReadyAt
                              ? t("web.admin.referrals.connected")
                              : "—"}
                        </td>
                        <td>{row.searchStartedAt ? when(row.searchStartedAt) : "—"}</td>
                        <td>{row.partyJoinedAt ? when(row.partyJoinedAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager
                offset={detailOffset}
                total={details.data.total}
                size={details.data.pageSize}
                onChange={setDetailOffset}
              />
            </>
          )}
        </section>
      )}
    </section>
  );
}

function Pager({
  offset,
  total,
  size,
  onChange
}: {
  offset: number;
  total: number;
  size: number;
  onChange: (offset: number) => void;
}) {
  const t = useTranslation();
  if (total <= size) return null;
  return (
    <nav className={styles.pager} aria-label={t("web.admin.referrals.pages")}>
      <button
        className="button-secondary"
        type="button"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - size))}
      >
        {t("web.admin.analytics.searchHistoryPrevious")}
      </button>
      <span>
        {Math.floor(offset / size) + 1} / {Math.ceil(total / size)}
      </span>
      <button
        className="button-secondary"
        type="button"
        disabled={offset + size >= total || offset + size > 10000}
        onClick={() => onChange(offset + size)}
      >
        {t("web.admin.analytics.searchHistoryNext")}
      </button>
    </nav>
  );
}
