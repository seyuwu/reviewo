"use client";

import { useEffect, useState } from "react";

import { fetchActiveBattles } from "../api/discovery-api";
import type { BattlePairListItem } from "../types/discovery";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { BattlePairList } from "./battle-pair-list";
import { FeedSection } from "./feed-section";

interface ActiveBattlesSectionProps {
  initialPairs?: BattlePairListItem[] | undefined;
}

export function ActiveBattlesSection({ initialPairs }: ActiveBattlesSectionProps) {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const hasInitialData = initialPairs !== undefined;
  const [pairs, setPairs] = useState<BattlePairListItem[]>(initialPairs ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    let cancelled = false;

    void fetchActiveBattles(4, resolvedLocale)
      .then((response) => {
        if (!cancelled) {
          setPairs(response.items);
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

  if (!isLoading && pairs.length === 0) {
    return null;
  }

  return (
    <FeedSection
      heading={t("web.homeFeed.sectionActiveBattles")}
      headingId="home-feed-active-battles"
      viewAllHref="/battles"
    >
      {isLoading ? (
        <p className="muted-copy">{t("chat.loading")}</p>
      ) : (
        <BattlePairList items={pairs.slice(0, 4)} showVoteSplit />
      )}
    </FeedSection>
  );
}
