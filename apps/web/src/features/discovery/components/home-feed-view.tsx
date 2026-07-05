"use client";

import { useTranslation } from "../../i18n/locale-provider";
import { BestWeekSection } from "./best-week-section";
import { CompactSearchBar } from "./compact-search-bar";
import { DiscussingNowSection } from "./discussing-now-section";
import { PopularBattlesSection } from "./popular-battles-section";
import { RisingTodaySection } from "./rising-today-section";
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

        <DiscussingNowSection />
        <PopularBattlesSection initialPairs={initialData?.battlePairs} />
        <RisingTodaySection initialItems={initialData?.risingItems} />
        <BestWeekSection initialItems={initialData?.weekTopItems} />
      </section>
    </div>
  );
}
