"use client";

import { useEffect, useState } from "react";

import { fetchTopRatings } from "../api/discovery-api";
import type { DiscoveryEntityRankItem } from "../types/discovery";
import { useTranslation } from "../../i18n/locale-provider";
import { EntityRankList } from "./entity-rank-list";
import { FeedSection } from "./feed-section";

interface BestWeekSectionProps {
  initialItems?: DiscoveryEntityRankItem[] | undefined;
}

export function BestWeekSection({ initialItems }: BestWeekSectionProps) {
  const t = useTranslation();
  const hasInitialData = initialItems !== undefined;
  const [items, setItems] = useState<DiscoveryEntityRankItem[]>(initialItems ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    if (hasInitialData) {
      return;
    }

    let cancelled = false;

    void fetchTopRatings("week", 6)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasInitialData]);

  return (
    <FeedSection
      heading={t("web.homeFeed.sectionBestWeek")}
      headingId="home-feed-best-week"
      viewAllHref="/top"
    >
      {isLoading ? (
        <p className="muted-copy">{t("chat.loading")}</p>
      ) : items.length > 0 ? (
        <EntityRankList items={items} showRecentVotes />
      ) : (
        <p className="muted-copy">{t("web.homeFeed.quiet")}</p>
      )}
    </FeedSection>
  );
}
