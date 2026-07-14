"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EntityAvatar } from "../../entities/components/entity-avatar";
import { formatEntityDisplayName } from "../../growth/lib/format-entity-display-name";
import { fetchDiscussionFeed } from "../api/discovery-api";
import type { DiscussionFeedMode, DiscussionFeedResponse } from "../types/discovery";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { FeedSection } from "./feed-section";

interface DiscussingNowSectionProps {
  embedded?: boolean;
  initialFeed?: DiscussionFeedResponse | undefined;
  maxItems?: number;
}

export function DiscussingNowSection({ embedded = false, initialFeed, maxItems }: DiscussingNowSectionProps) {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const hasInitialData = initialFeed !== undefined;
  const [feed, setFeed] = useState<DiscussionFeedResponse>(
    initialFeed ?? { items: [], mode: "popular" }
  );
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    let cancelled = false;

    void fetchDiscussionFeed(6, resolvedLocale)
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
  }, [resolvedLocale]);

  const heading = resolveDiscussionHeading(t, feed.mode);
  const visibleItems = maxItems ? feed.items.slice(0, maxItems) : feed.items;

  return (
    <FeedSection embedded={embedded} heading={heading} headingId="home-feed-discussing">
      {isLoading && feed.items.length === 0 ? (
        <p className="muted-copy">{t("chat.loading")}</p>
      ) : (
        <ul className="growth-trending-list">
          {visibleItems.map((item) => {
            const label = formatEntityDisplayName({
              canonicalUrl: null,
              slug: item.entitySlug,
              title: item.entityTitle
            });

            return (
              <li key={item.entityId}>
                <Link className="growth-trending-item" href={`/entities/${item.entityId}`}>
                  <EntityAvatar
                    canonicalUrl={item.entityCanonicalUrl}
                    entityId={item.entityId}
                    logoUrl={item.entityLogoUrl}
                    size="sm"
                    title={label}
                  />
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
