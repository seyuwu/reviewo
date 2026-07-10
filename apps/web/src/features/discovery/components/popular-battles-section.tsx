"use client";

import { useEffect, useState } from "react";

import { fetchActiveBattles, fetchSuggestedBattles } from "../api/discovery-api";
import type { BattlePairListItem } from "../types/discovery";
import { getFallbackBattlePairsFromClient } from "../lib/client-battle-fallback";
import { useLocale, useTranslation } from "../../i18n/locale-provider";
import { BattlePairList } from "./battle-pair-list";
import { FeedSection } from "./feed-section";

interface PopularBattlesSectionProps {
  initialPairs?: BattlePairListItem[] | undefined;
}

export function PopularBattlesSection({ initialPairs }: PopularBattlesSectionProps) {
  const t = useTranslation();
  const { resolvedLocale } = useLocale();
  const hasInitialData = initialPairs !== undefined;
  const [pairs, setPairs] = useState<BattlePairListItem[]>(initialPairs ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    let cancelled = false;

    void fetchActiveBattles(4, resolvedLocale)
      .then((activeResponse) => {
        if (cancelled) {
          return;
        }

        if (activeResponse.items.length > 0) {
          setPairs(activeResponse.items);
          return;
        }

        return fetchSuggestedBattles(4, resolvedLocale).then((suggestedResponse) => {
          if (cancelled) {
            return;
          }

          setPairs(
            suggestedResponse.items.length > 0
              ? suggestedResponse.items
              : getFallbackBattlePairsFromClient()
          );
        });
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
      heading={t("web.homeFeed.sectionBattles")}
      headingId="home-feed-battles"
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
