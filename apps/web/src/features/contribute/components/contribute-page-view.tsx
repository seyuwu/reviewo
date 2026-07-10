"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useAuthSession } from "../../auth/hooks/use-auth-session";
import { fetchContributeQueues } from "../api/contribute-api";
import { useTranslation } from "../../i18n/locale-provider";
import type { TranslateFn } from "@reviewo/i18n";
import type { ContributeQueue, ContributeQueuesResponse } from "../types/contribute";

interface ContributePageViewProps {
  initialData: ContributeQueuesResponse | null;
}

const NEEDS_REVIEWS_QUEUE_KEY = "entities_without_reviews";

export function ContributePageView({ initialData }: ContributePageViewProps) {
  const t = useTranslation();
  const { authSession } = useAuthSession();
  const accessToken = authSession?.accessToken;

  const contributeQuery = useQuery({
    enabled: Boolean(accessToken),
    initialData: initialData ?? undefined,
    queryFn: () => fetchContributeQueues(20, accessToken),
    queryKey: ["contribute-queues", accessToken ?? null]
  });

  const data = accessToken ? contributeQuery.data ?? initialData : initialData;
  const queues = (data?.queues ?? []).filter((queue) => queue.count > 0);
  const needsReviewsQueue = queues.find((queue) => queue.key === NEEDS_REVIEWS_QUEUE_KEY) ?? null;
  const visibleNeedsReviewsQueue =
    needsReviewsQueue && needsReviewsQueue.items.length > 0
      ? { ...needsReviewsQueue, count: needsReviewsQueue.items.length }
      : null;
  const otherQueues = queues.filter((queue) => queue.key !== NEEDS_REVIEWS_QUEUE_KEY);
  const hasQueues = Boolean(visibleNeedsReviewsQueue) || otherQueues.length > 0;

  return (
    <section className="contribute-page ui-fade-in">
      <header className="contribute-page-header section-heading">
        <p className="eyebrow">{t("web.nav.contribute")}</p>
        <h1>{t("web.contribute.title")}</h1>
        <p className="muted-copy">{t("web.contribute.subtitle")}</p>
      </header>

      {!hasQueues ? (
        <div className="panel-card contribute-empty-card">
          <p className="muted-copy">{t("web.contribute.empty")}</p>
        </div>
      ) : (
        <>
          {visibleNeedsReviewsQueue ? (
            <section aria-labelledby="contribute-needs-reviews-heading" className="contribute-needs-reviews-section">
              <div className="contribute-needs-reviews-header section-heading">
                <p className="result-type">{t("web.contribute.needsReviewsTitle")}</p>
                <h2 id="contribute-needs-reviews-heading">{t("web.contribute.needsReviewsTitle")}</h2>
                <p className="muted-copy">{t("web.contribute.needsReviewsSubtitle")}</p>
              </div>

              <ContributeNeedsReviewsGrid queue={visibleNeedsReviewsQueue} />
            </section>
          ) : null}

          {otherQueues.length > 0 ? (
            <section aria-labelledby="contribute-other-queues-heading" className="contribute-other-queues-section">
              {visibleNeedsReviewsQueue ? (
                <h2 className="contribute-other-queues-title" id="contribute-other-queues-heading">
                  {t("web.contribute.otherQueuesTitle")}
                </h2>
              ) : null}

              <div className="contribute-queue-list">
                {otherQueues.map((queue) => (
                  <ContributeQueueCard key={queue.key} queue={queue} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}

function ContributeNeedsReviewsGrid({ queue }: { queue: ContributeQueue }) {
  const t = useTranslation();

  return (
    <ul className="contribute-needs-reviews-grid">
      {queue.items.map((item) => (
        <li key={`${queue.key}-${item.href}`}>
          <Link
            className="contribute-needs-reviews-card panel-card"
            href={item.href}
            aria-label={`${item.title} — ${t("web.contribute.open")}`}
          >
            <strong>{item.title}</strong>
            {item.slug ? <span className="contribute-item-meta">{item.slug}</span> : null}
            <span
              className={
                item.viewerHasRated
                  ? "contribute-needs-reviews-badge contribute-needs-reviews-badge-rated"
                  : "contribute-needs-reviews-badge"
              }
            >
              {item.viewerHasRated
                ? t("web.contribute.needsReviewsRatedHint")
                : t("web.contribute.needsReviewsHint")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ContributeQueueCard({ queue }: { queue: ContributeQueue }) {
  const t = useTranslation();
  const label = getQueueLabel(queue.key, t);

  return (
    <article className="panel-card contribute-queue-card">
      <div className="contribute-queue-header">
        <div>
          <h2>{label}</h2>
          <p className="muted-copy contribute-queue-caption">
            {t("web.contribute.queueHint", { count: String(queue.count) })}
          </p>
        </div>
        <span className="contribute-queue-count">{queue.count}</span>
      </div>

      {queue.items.length === 0 ? null : (
        <ul className="contribute-item-grid">
          {queue.items.map((item) => (
            <li key={`${queue.key}-${item.href}`}>
              <Link
                className="contribute-item-card"
                href={item.href}
                aria-label={`${formatQueueItemTitle(item, queue.key)} — ${t("web.contribute.open")}`}
              >
                <div className="contribute-item-copy">
                  <strong>{formatQueueItemTitle(item, queue.key)}</strong>
                  {item.slug ? <span className="contribute-item-meta">{item.slug}</span> : null}
                  {queue.key === "low_activity_battles" && item.totalVotes !== undefined ? (
                    <span className="contribute-item-meta">
                      {t("web.contribute.battleVotes", { count: String(item.totalVotes) })}
                    </span>
                  ) : null}
                </div>
                <span className="contribute-item-action" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function formatQueueItemTitle(
  item: ContributeQueue["items"][number],
  queueKey: string
): string {
  if (queueKey === "low_activity_battles" && item.leftSlug && item.rightSlug) {
    return `${item.leftSlug} vs ${item.rightSlug}`;
  }

  return item.title;
}

function getQueueLabel(key: string, t: TranslateFn): string {
  switch (key) {
    case "entities_without_reviews":
      return t("web.contribute.queue.entities_without_reviews");
    case "entities_without_logo":
      return t("web.contribute.queue.entities_without_logo");
    case "possible_duplicates":
      return t("web.contribute.queue.possible_duplicates");
    case "tops_without_description":
      return t("web.contribute.queue.tops_without_description");
    case "low_activity_battles":
      return t("web.contribute.queue.low_activity_battles");
    default:
      return key;
  }
}
