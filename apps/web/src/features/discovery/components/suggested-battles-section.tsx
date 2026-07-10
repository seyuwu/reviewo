"use client";

import { useEffect, useState } from "react";

import { fetchSuggestedBattles } from "../api/discovery-api";
import type { BattlePairListItem } from "../types/discovery";
import { getFallbackBattlePairsFromClient } from "../lib/client-battle-fallback";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { BattlePairList } from "./battle-pair-list";
import { FeedSection } from "./feed-section";

interface SuggestedBattlesSectionProps {
  initialPairs?: BattlePairListItem[] | undefined;
}

export function SuggestedBattlesSection({ initialPairs }: SuggestedBattlesSectionProps) {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const hasInitialData = initialPairs !== undefined;
  const [pairs, setPairs] = useState<BattlePairListItem[]>(initialPairs ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    let cancelled = false;

    void fetchSuggestedBattles(4, resolvedLocale)
      .then((response) => {
        if (!cancelled) {
          setPairs(
            response.items.length > 0 ? response.items : getFallbackBattlePairsFromClient()
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPairs(getFallbackBattlePairsFromClient());
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
  }, [resolvedLocale]);

  return (
    <FeedSection
      heading={t("web.homeFeed.sectionSuggestedBattles")}
      headingId="home-feed-suggested-battles"
      viewAllHref="/battles"
    >
      {isLoading ? (
        <p className="muted-copy">{t("chat.loading")}</p>
      ) : (
        <BattlePairList items={pairs.slice(0, 4)} showVoteSplit={pairs.some((pair) => pair.totalVotes > 0)} />
      )}
    </FeedSection>
  );
}
