"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FormFeedback } from "../../../components/form-feedback";
import { ApiError } from "../../../lib/api/api-error";
import { readApiErrorMessage } from "../../../lib/api/read-api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { formatContributionSummary } from "../../contributions/lib/format-contribution-summary";
import { MergeContributionSummary } from "../../contributions/components/merge-contribution-summary";
import { LinkContributionSummary } from "../../contributions/components/link-contribution-summary";
import type { ContributionType } from "../../contributions/types/contributions";
import { formatContributionTypeLabel } from "../../i18n/contribution-type-label";
import { useTranslation } from "../../i18n/locale-provider";
import { getCurrentUserProfile } from "../../profile/api/profile";
import {
  fetchAdminContributionStats,
  fetchAdminContributions,
  resolveAdminContribution
} from "../api/admin-contributions-api";
import type { AdminContributionListItem, AdminContributionTypeFilter } from "../types/admin-contributions";
import styles from "./admin-page-view.module.css";

const TYPE_FILTERS: AdminContributionTypeFilter[] = [
  "ALL",
  "LINK_ENTITY",
  "UNLINK_ENTITY",
  "MERGE_ENTITY",
  "UPDATE_URL",
  "UPDATE_NAME",
  "UPDATE_DESCRIPTION",
  "UPDATE_LOGO",
  "UPDATE_TYPE"
];

export function AdminPageView() {
  const t = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authSession, isAuthSessionLoaded } = useAuthSession();
  const accessToken = authSession?.accessToken;
  const [typeFilter, setTypeFilter] = useState<AdminContributionTypeFilter>("ALL");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const profileQuery = useQuery({
    enabled: Boolean(accessToken),
    queryFn: () => getCurrentUserProfile(accessToken ?? ""),
    queryKey: ["profile", "me", accessToken]
  });

  const statsQuery = useQuery({
    enabled: Boolean(accessToken) && profileQuery.data?.role === "ADMIN",
    queryFn: () => fetchAdminContributionStats(accessToken ?? ""),
    queryKey: ["admin-contributions", "stats"]
  });

  const queueQuery = useQuery({
    enabled: Boolean(accessToken) && profileQuery.data?.role === "ADMIN",
    queryFn: () =>
      fetchAdminContributions(accessToken ?? "", {
        limit: 50,
        type: typeFilter
      }),
    queryKey: ["admin-contributions", "queue", typeFilter]
  });

  const resolveMutation = useMutation({
    mutationFn: (input: { action: "apply" | "reject"; contributionId: string }) => {
      if (!accessToken) {
        throw new Error("Missing auth token");
      }

      return resolveAdminContribution(input.contributionId, input.action, accessToken);
    },
    onError: (error) => {
      setStatusMessage(null);
      setErrorMessage(
        (error instanceof ApiError ? readApiErrorMessage(error.body) : null) ??
          t("contributions.adminResolveFailed")
      );
    },
    onSuccess: (result, variables) => {
      setErrorMessage(null);
      setStatusMessage(
        variables.action === "apply"
          ? t("contributions.appliedSuccess")
          : t("contributions.rejectedSuccess")
      );
      void queryClient.invalidateQueries({ queryKey: ["admin-contributions"] });

      if (variables.action === "apply" && result.status === "APPLIED") {
        void queryClient.refetchQueries({ queryKey: ["entity-page", result.entityId] });

        if (result.type === "LINK_ENTITY" || result.type === "UNLINK_ENTITY") {
          const relatedEntityId = readLinkRelatedEntityId(result.payload);

          if (relatedEntityId) {
            void queryClient.refetchQueries({ queryKey: ["entity-page", relatedEntityId] });
          }
        }

        if (result.type === "MERGE_ENTITY") {
          const targetEntityId = readMergeTargetEntityId(result.payload);

          if (targetEntityId) {
            void queryClient.refetchQueries({ queryKey: ["entity-page", targetEntityId] });
          }
        }
      }
    }
  });

  const isAdmin = profileQuery.data?.role === "ADMIN";

  if (!isAuthSessionLoaded || profileQuery.isLoading) {
    return <p className="muted-copy">{t("common.loadingEllipsis")}</p>;
  }

  if (!authSession) {
    router.replace("/profile");
    return null;
  }

  if (profileQuery.isError || !isAdmin) {
    return (
      <section className={`panel-card ${styles.adminAccessDenied}`}>
        <h1>{t("admin.accessDeniedTitle")}</h1>
        <p className="muted-copy">{t("admin.accessDeniedBody")}</p>
        <Link className="button-secondary" href="/profile">
          {t("admin.backToProfile")}
        </Link>
      </section>
    );
  }

  return (
    <section className={styles.adminPage}>
      <header className={styles.adminHeader}>
        <p className="eyebrow">{t("admin.eyebrow")}</p>
        <h1>{t("admin.title")}</h1>
        <p className="hero-copy">{t("admin.subtitle")}</p>
        <Link className="button-secondary" href="/admin/economy">
          {t("web.admin.economy.openPanel")}
        </Link>
      </header>

      <div className={styles.adminStatsGrid}>
        <StatCard label={t("admin.stats.pendingTotal")} value={String(statsQuery.data?.pendingTotal ?? 0)} />
        <StatCard
          label={t("admin.stats.appliedLast7Days")}
          value={String(statsQuery.data?.appliedLast7Days ?? 0)}
        />
        <StatCard
          label={t("admin.stats.rejectedLast7Days")}
          value={String(statsQuery.data?.rejectedLast7Days ?? 0)}
        />
        <StatCard
          label={t("admin.stats.oldestPending")}
          value={formatOldestPending(statsQuery.data?.oldestPendingAt, t("admin.stats.none"))}
        />
      </div>

      <div className={styles.adminTypeChips} role="tablist" aria-label={t("admin.filterLabel")}>
        {TYPE_FILTERS.map((type) => (
          <button
            key={type}
            type="button"
            className={typeFilter === type ? "home-hub-tab is-active" : "home-hub-tab"}
            aria-pressed={typeFilter === type}
            onClick={() => {
              setTypeFilter(type);
            }}
          >
            {formatTypeFilterLabel(t, type, statsQuery.data?.pendingByType)}
          </button>
        ))}
      </div>

      <FormFeedback errorMessage={errorMessage} statusMessage={statusMessage} />

      <div className={styles.adminQueue}>
        {queueQuery.isLoading ? <p className="muted-copy">{t("common.loadingEllipsis")}</p> : null}
        {queueQuery.isError ? <p className="muted-copy">{t("admin.queueLoadError")}</p> : null}
        {(queueQuery.data?.items.length ?? 0) === 0 && !queueQuery.isLoading ? (
          <p className="muted-copy">{t("admin.queueEmpty")}</p>
        ) : null}
        {queueQuery.data?.items.map((item) => (
          <AdminQueueCard
            isResolving={resolveMutation.isPending}
            item={item}
            key={item.id}
            onResolve={(action) => {
              resolveMutation.mutate({ action, contributionId: item.id });
            }}
          />
        ))}
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.adminStatCard}>
      <span className={styles.adminStatLabel}>{label}</span>
      <strong className={styles.adminStatValue}>{value}</strong>
    </div>
  );
}

function AdminQueueCard({
  isResolving,
  item,
  onResolve
}: {
  isResolving: boolean;
  item: AdminContributionListItem;
  onResolve: (action: "apply" | "reject") => void;
}) {
  const t = useTranslation();
  const summary =
    item.type === "MERGE_ENTITY" ||
    item.type === "LINK_ENTITY" ||
    item.type === "UNLINK_ENTITY"
      ? null
      : formatContributionSummary(t, item);
  const createdAtLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(item.createdAt)),
    [item.createdAt]
  );

  return (
    <article className={styles.adminQueueCard}>
      <div className={styles.adminQueueHeader}>
        <div>
          <p className="result-type">{formatContributionTypeLabel(t, item.type)}</p>
          {summary ? <p className={styles.adminQueueSummary}>{summary}</p> : null}
          {item.type === "MERGE_ENTITY" ? (
            <MergeContributionSummary
              currentEntity={{ id: item.entity.id, title: item.entity.title }}
              payload={item.payload}
            />
          ) : null}
          {item.type === "LINK_ENTITY" || item.type === "UNLINK_ENTITY" ? (
            <LinkContributionSummary payload={item.payload} />
          ) : null}
        </div>
        <span className="contribution-vote-score">{t("contributions.moderationBadge")}</span>
      </div>

      <div className={styles.adminQueueMeta}>
        <span>
          {t("admin.queueEntity")}:{" "}
          <Link href={`/entities/${item.entity.id}`}>{item.entity.title}</Link>
        </span>
        <span>
          {t("admin.queueAuthor")}: {item.author.displayName}
        </span>
        <span>
          {t("admin.queueCreatedAt")}: {createdAtLabel}
        </span>
      </div>

      <div className={styles.adminQueueActions}>
        <button
          type="button"
          className="contribution-vote-button is-approve"
          disabled={isResolving}
          onClick={() => {
            onResolve("apply");
          }}
        >
          {t("contributions.adminApply")}
        </button>
        <button
          type="button"
          className="contribution-vote-button is-reject"
          disabled={isResolving}
          onClick={() => {
            onResolve("reject");
          }}
        >
          {t("contributions.adminReject")}
        </button>
      </div>
    </article>
  );
}

function formatOldestPending(value: string | null | undefined, noneLabel: string): string {
  if (!value) {
    return noneLabel;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTypeFilterLabel(
  t: ReturnType<typeof useTranslation>,
  type: AdminContributionTypeFilter,
  pendingByType?: Partial<Record<ContributionType, number>>
): string {
  if (type === "ALL") {
    const total = pendingByType
      ? Object.values(pendingByType).reduce((sum, count) => sum + (count ?? 0), 0)
      : 0;

    return t("admin.filterAll", { count: String(total) });
  }

  const count = pendingByType?.[type] ?? 0;

  return `${formatContributionTypeLabel(t, type)} (${count})`;
}

function readLinkRelatedEntityId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("relatedEntityId" in payload)) {
    return null;
  }

  const relatedEntityId = (payload as { relatedEntityId?: unknown }).relatedEntityId;

  return typeof relatedEntityId === "string" ? relatedEntityId : null;
}

function readMergeTargetEntityId(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || !("targetEntityId" in payload)) {
    return null;
  }

  const targetEntityId = (payload as { targetEntityId?: unknown }).targetEntityId;

  return typeof targetEntityId === "string" ? targetEntityId : null;
}
