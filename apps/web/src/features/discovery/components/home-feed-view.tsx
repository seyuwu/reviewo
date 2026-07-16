"use client";

import { useTranslation } from "../../i18n/locale-provider";
import { SpotlightHomeSection } from "../../spotlight/components/spotlight-home-section";
import { ActiveBattlesSection } from "./active-battles-section";
import { BestWeekSection } from "./best-week-section";
import { CompactSearchBar } from "./compact-search-bar";
import { DiscussingNowSection } from "./discussing-now-section";
import { HomeBottomCta } from "./home-bottom-cta";
import { HomeProductIntentPrompt } from "./home-product-intent-prompt";
import { HomeQuickNav } from "./home-quick-nav";
import { RandomBattleSection } from "./random-battle-section";
import type { HomeFeedInitialData } from "../lib/load-home-feed-data";

interface HomeFeedViewProps {
  initialData?: HomeFeedInitialData;
}

export function HomeFeedView({ initialData }: HomeFeedViewProps) {
  const t = useTranslation();

  return (
    <div className="home-hub home-dashboard">
      <section className="home-hero-card home-dashboard-intro" aria-labelledby="home-feed-heading">
        <header className="home-hub-header">
          <h1 id="home-feed-heading">
            {t("web.homeFeed.titleLead")}{" "}
            <span className="home-hero-accent">{t("brand.name")}</span>
          </h1>
          <p className="home-hub-subtitle">{t("web.homeFeed.subtitle")}</p>
        </header>

        <CompactSearchBar variant="hero" />
        <HomeQuickNav />
      </section>

      <aside className="home-widget-card home-dashboard-top" aria-label={t("web.homeFeed.sectionTopObjects")}>
        <BestWeekSection initialItems={initialData?.weekTopItems} maxItems={5} embedded />
      </aside>

      <div className="home-dashboard-random">
          <RandomBattleSection battle={initialData?.randomBattle.item} />
      </div>

      <aside className="home-widget-card home-dashboard-discussions" aria-label={t("web.homeFeed.sidebarAriaLabel")}>
        <DiscussingNowSection initialFeed={initialData?.discussionFeed} maxItems={4} embedded />
      </aside>

      <div className="home-dashboard-active">
          <ActiveBattlesSection initialPairs={initialData?.activeBattlePairs} />
      </div>

      <div className="home-dashboard-showcase">
        <SpotlightHomeSection initialItems={initialData?.spotlightItems} layout="showcase" />
      </div>

      <div className="home-dashboard-cta">
        <HomeBottomCta />
      </div>

      <HomeProductIntentPrompt />
    </div>
  );
}
