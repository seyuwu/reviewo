"use client";

import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import {
  fetchAllActiveParties,
  type AdminPartiesPage,
  type AdminPartySummary
} from "../api/admin-parties-api";
import { usePartyAdminAccess } from "../hooks/use-party-admin-access";
import styles from "./all-parties-view.module.css";

export function AllPartiesView() {
  const t = useTranslation();
  const { accessToken, isAdmin, isLoading } = usePartyAdminAccess();
  const [kind, setKind] = useState<"ALL" | "PARTY" | "TEAM">("ALL");
  const parties = useInfiniteQuery<
    AdminPartiesPage,
    Error,
    InfiniteData<AdminPartiesPage>,
    readonly unknown[],
    string | undefined
  >({
    enabled: isAdmin,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchAllActiveParties(accessToken ?? "", {
        before: pageParam,
        kind: kind === "ALL" ? undefined : kind
      }),
    queryKey: ["all-active-parties", accessToken, kind],
    refetchOnWindowFocus: false,
    gcTime: 0,
    retry: false
  });
  if (isLoading) return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  if (!isAdmin)
    return (
      <section className={`panel-card ${styles.page}`}>
        <h1>{t("admin.accessDeniedTitle")}</h1>
        <p className="muted-copy">{t("dota.allParties.adminOnly")}</p>
        <Link className="button-secondary" href="/games/community">
          {t("web.nav.rosters")}
        </Link>
      </section>
    );
  const items = parties.isError
    ? []
    : [
        ...new Map(
          parties.data?.pages.flatMap((page) => page.items).map((party) => [party.id, party])
        ).values()
      ];
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/games/community">{t("web.nav.rosters")}</Link>
          <h1>{t("dota.allParties.title")}</h1>
          <p className="muted-copy">{t("dota.allParties.description")}</p>
        </div>
        <button
          className="button-secondary"
          disabled={parties.isFetching}
          onClick={() => void parties.refetch()}
          type="button"
        >
          {t("dota.allParties.refresh")}
        </button>
      </header>
      <div className={styles.filters} aria-label={t("dota.allParties.filters")}>
        {(["ALL", "PARTY", "TEAM"] as const).map((value) => (
          <button
            aria-pressed={kind === value}
            className={kind === value ? "button-primary" : "button-secondary"}
            key={value}
            onClick={() => setKind(value)}
            type="button"
          >
            {t(
              value === "ALL"
                ? "dota.allParties.all"
                : value === "PARTY"
                  ? "dota.allParties.parties"
                  : "dota.allParties.teams"
            )}
          </button>
        ))}
        {parties.data ? (
          <span className="muted-copy">
            {t("dota.allParties.total", { count: String(parties.data.pages[0]?.total ?? 0) })}
          </span>
        ) : null}
      </div>
      {parties.isPending ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}
      {parties.isError ? <p role="alert">{t("dota.allParties.loadError")}</p> : null}
      {parties.isSuccess && items.length === 0 ? (
        <div className={`panel-card ${styles.empty}`}>{t("dota.allParties.empty")}</div>
      ) : null}
      <div className={styles.grid}>
        {items.map((party) => (
          <PartyCard key={party.id} party={party} />
        ))}
      </div>
      {parties.hasNextPage ? (
        <button
          className={`button-secondary ${styles.more}`}
          disabled={parties.isFetching}
          onClick={() => void parties.fetchNextPage()}
          type="button"
        >
          {t("dota.allParties.more")}
        </button>
      ) : null}
    </section>
  );
}

function PartyCard({ party }: { party: AdminPartySummary }) {
  const t = useTranslation();
  const date = (value: string) =>
    new Date(value).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  return (
    <article className={`panel-card ${styles.card}`}>
      <div className={styles.cardHeader}>
        <h2>{party.name}</h2>
        <span className={styles.badge}>
          {party.members.length}/{party.maxMembers}
        </span>
      </div>
      <div className={styles.details}>
        <span>{t(party.kind === "PARTY" ? "dota.team.kindParty" : "dota.team.kindTeam")}</span>
        <span>
          {t(party.visibility === "PRIVATE" ? "dota.allParties.private" : "dota.allParties.public")}
        </span>
        <span>
          {t(party.joinMode === "OPEN" ? "dota.allParties.open" : "dota.allParties.application")}
        </span>
      </div>
      <ul className={styles.members}>
        {party.members.map((member) => (
          <li key={member.userId}>
            <span className={styles.position}>{member.positionRole ?? "—"}</span>
            <span className={styles.name}>{member.displayName}</span>
            {member.role !== "MEMBER" ? (
              <small>
                {t(member.role === "OWNER" ? "dota.team.roleOwner" : "dota.team.roleOfficer")}
              </small>
            ) : null}
          </li>
        ))}
      </ul>
      <div className={styles.dates}>
        <span>{t("dota.allParties.created", { date: date(party.createdAt) })}</span>
        {party.expiresAt ? (
          <span>{t("dota.allParties.expires", { date: date(party.expiresAt) })}</span>
        ) : null}
      </div>
      <Link
        className={`button-primary ${styles.open}`}
        href={`/dota/teams/${encodeURIComponent(party.slug)}`}
      >
        {t("dota.allParties.viewParty")}
      </Link>
    </article>
  );
}
