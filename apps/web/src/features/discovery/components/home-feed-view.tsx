"use client";

import { useTranslation } from "../../i18n/locale-provider";
import { ActiveBattlesSection } from "./active-battles-section";
import { BestWeekSection } from "./best-week-section";
import { CompactSearchBar } from "./compact-search-bar";
import { DiscussingNowSection } from "./discussing-now-section";
import { RandomBattleSection } from "./random-battle-section";
import { RisingTodaySection } from "./rising-today-section";
import { SuggestedBattlesSection } from "./suggested-battles-section";
import type { HomeFeedInitialData } from "../lib/load-home-feed-data";

interface HomeFeedViewProps {
  initialData?: HomeFeedInitialData;
}

export function HomeFeedView({ initialData }: HomeFeedViewProps) {
  const t = useTranslation();

  return (
    <div className="home-hub">
      <section className="home-hub-card discovery-feed" aria-labelledby="home-feed-heading">
        <header className="home-hub-header">
          <h1 id="home-feed-heading">{t("web.homeFeed.title")}</h1>
          <p className="home-hub-subtitle">{t("web.homeFeed.subtitle")}</p>
        </header>

        <CompactSearchBar />

        <RandomBattleSection battle={initialData?.randomBattle.item} />
        <DiscussingNowSection initialFeed={initialData?.discussionFeed} />
        <ActiveBattlesSection initialPairs={initialData?.activeBattlePairs} />
        <RisingTodaySection initialItems={initialData?.risingItems} />
        <BestWeekSection initialItems={initialData?.weekTopItems} />
        <SuggestedBattlesSection initialPairs={initialData?.suggestedBattlePairs} />
      </section>
    </div>
  );
}
