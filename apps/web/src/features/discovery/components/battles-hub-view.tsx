"use client";

import { useEffect, useState } from "react";

import { fetchActiveBattles, fetchSuggestedBattles } from "../api/discovery-api";
import type { BattlePairListItem } from "../types/discovery";
import { getFallbackBattlePairsFromClient } from "../lib/client-battle-fallback";
import { useTranslation } from "../../i18n/locale-provider";
import { BattlePairList } from "./battle-pair-list";
import { ComparePairPicker } from "./compare-pair-picker";

interface BattlesHubViewProps {
  initialActivePairs?: BattlePairListItem[] | undefined;
  initialSuggestedPairs?: BattlePairListItem[] | undefined;
}

export function BattlesHubView({ initialActivePairs, initialSuggestedPairs }: BattlesHubViewProps) {
  const t = useTranslation();
  const hasInitialData = initialActivePairs !== undefined && initialSuggestedPairs !== undefined;
  const [activePairs, setActivePairs] = useState<BattlePairListItem[]>(initialActivePairs ?? []);
  const [suggestedPairs, setSuggestedPairs] = useState<BattlePairListItem[]>(initialSuggestedPairs ?? []);
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    if (hasInitialData) {
      return;
    }

    let cancelled = false;

    void Promise.all([fetchActiveBattles(12), fetchSuggestedBattles(12)])
      .then(([activeResponse, suggestedResponse]) => {
        if (cancelled) {
          return;
        }

        setActivePairs(activeResponse.items);
        setSuggestedPairs(
          suggestedResponse.items.length > 0
            ? suggestedResponse.items
            : getFallbackBattlePairsFromClient()
        );
      })
      .catch(() => {
        if (!cancelled) {
          setActivePairs([]);
          setSuggestedPairs(getFallbackBattlePairsFromClient());
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
    <div className="home-hub">
      <section className="home-hub-card discovery-battles-hub" aria-labelledby="battles-hub-heading">
        <header className="home-hub-header">
          <h1 id="battles-hub-heading">{t("web.battlesHub.title")}</h1>
          <p className="home-hub-subtitle">{t("web.battlesHub.subtitle")}</p>
        </header>

        <ComparePairPicker />

        <section className="discovery-feed-section" aria-labelledby="battles-active-heading">
          <div className="discovery-feed-section-header">
            <h2 id="battles-active-heading">{t("web.battlesHub.activeTitle")}</h2>
          </div>
          {isLoading ? (
            <p className="muted-copy">{t("chat.loading")}</p>
          ) : activePairs.length > 0 ? (
            <BattlePairList items={activePairs} />
          ) : (
            <p className="muted-copy">{t("web.battlesHub.noActive")}</p>
          )}
        </section>

        <section className="discovery-feed-section" aria-labelledby="battles-suggested-heading">
          <div className="discovery-feed-section-header">
            <h2 id="battles-suggested-heading">{t("web.battlesHub.suggestedTitle")}</h2>
          </div>
          {isLoading ? (
            <p className="muted-copy">{t("chat.loading")}</p>
          ) : (
            <BattlePairList items={suggestedPairs} showVoteSplit={false} />
          )}
        </section>
      </section>
    </div>
  );
}
