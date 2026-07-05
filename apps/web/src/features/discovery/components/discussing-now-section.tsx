"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatEntityDisplayName } from "../../growth/lib/format-entity-display-name";
import { fetchDiscussionFeed } from "../api/discovery-api";
import type { DiscussionFeedMode, DiscussionFeedResponse } from "../types/discovery";
import { useTranslation } from "../../i18n/locale-provider";
import { FeedSection } from "./feed-section";

interface DiscussingNowSectionProps {
  initialFeed?: DiscussionFeedResponse | undefined;
}

export function DiscussingNowSection({ initialFeed }: DiscussingNowSectionProps) {
  const t = useTranslation();
  const hasInitialData = initialFeed !== undefined;
  const [feed, setFeed] = useState<DiscussionFeedResponse>(
    initialFeed ?? { items: [], mode: "popular" }
  );
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    let cancelled = false;

    void fetchDiscussionFeed(6)
      .then((response) => {
        if (!cancelled) {
          setFeed(response);
        }
      })
      .catch(() => {
        // Keep SSR snapshot on transient failures.
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const heading = resolveDiscussionHeading(t, feed.mode);

  return (
    <FeedSection heading={heading} headingId="home-feed-discussing">
      {isLoading && feed.items.length === 0 ? (
        <p className="muted-copy">{t("chat.loading")}</p>
      ) : (
        <ul className="growth-trending-list">
          {feed.items.map((item) => {
            const label = formatEntityDisplayName({
              canonicalUrl: null,
              slug: item.entitySlug,
              title: item.entityTitle
            });

            return (
              <li key={item.entityId}>
                <Link className="growth-trending-item" href={`/entities/${item.entityId}`}>
                  <span className="growth-trending-item-main">
                    <strong>{label}</strong>
                    <span className="muted-copy">{resolveDiscussionSubtitle(t, feed.mode, item)}</span>
                  </span>
                  <span className="growth-trending-item-meta">{resolveDiscussionMeta(t, feed.mode, item)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </FeedSection>
  );
}

function resolveDiscussionHeading(
  t: ReturnType<typeof useTranslation>,
  mode: DiscussionFeedMode
): string {
  if (mode === "live") {
    return t("web.homeFeed.sectionDiscussing");
  }

  return t("web.homeFeed.sectionDiscussedRecently");
}

function resolveDiscussionSubtitle(
  t: ReturnType<typeof useTranslation>,
  mode: DiscussionFeedMode,
  item: DiscussionFeedResponse["items"][number]
): string {
  if (mode === "live" || mode === "recent") {
    return item.previewMessage ?? t("web.homeFeed.discussionOpen");
  }

  if (item.avgScore !== null && item.votesCount !== null) {
    return `${item.avgScore.toFixed(1)} · ${t("search.canonical.ratings", { count: item.votesCount })}`;
  }

  return t("web.homeFeed.discussionOpen");
}

function resolveDiscussionMeta(
  t: ReturnType<typeof useTranslation>,
  mode: DiscussionFeedMode,
  item: DiscussionFeedResponse["items"][number]
): string {
  if (mode === "live" && item.onlineCount > 0) {
    return t("chat.activeNow.online", { count: String(item.onlineCount) });
  }

  if ((mode === "live" || mode === "recent") && item.messageCount > 0) {
    return t("web.homeFeed.discussionMessages", { count: String(item.messageCount) });
  }

  return t("web.homeFeed.discussionOpen");
}
