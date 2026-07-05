"use client";

import { useEffect, useState } from "react";

import { fetchTopRatings } from "../api/discovery-api";
import type { DiscoveryEntityRankItem, DiscoveryRatingsWindow } from "../types/discovery";
import { useTranslation } from "../../i18n/locale-provider";
import { EntityRankList } from "./entity-rank-list";

interface TopsPageViewProps {
  initialItems?: DiscoveryEntityRankItem[] | undefined;
  initialWindow?: DiscoveryRatingsWindow | undefined;
}

export function TopsPageView({ initialItems, initialWindow = "week" }: TopsPageViewProps) {
  const t = useTranslation();
  const hasInitialData = initialItems !== undefined;
  const [window, setWindow] = useState<DiscoveryRatingsWindow>(initialWindow);
  const [items, setItems] = useState<DiscoveryEntityRankItem[]>(initialItems ?? []);
  const [loadedWindow, setLoadedWindow] = useState<DiscoveryRatingsWindow | null>(
    hasInitialData ? initialWindow : null
  );
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(loadedWindow !== window);

    void fetchTopRatings(window, 20)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
          setLoadedWindow(window);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoadedWindow(window);
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
  }, [window]);

  return (
    <div className="home-hub">
      <section className="home-hub-card" aria-labelledby="tops-page-heading">
        <header className="home-hub-header">
          <h1 id="tops-page-heading">{t("web.topsPage.title")}</h1>
          <p className="home-hub-subtitle">{t("web.topsPage.subtitle")}</p>
        </header>

        <div className="discovery-window-tabs" role="tablist" aria-label={t("web.topsPage.title")}>
          <button
            type="button"
            className={window === "week" ? "discovery-window-tab is-active" : "discovery-window-tab"}
            role="tab"
            aria-selected={window === "week"}
            onClick={() => {
              setWindow("week");
            }}
          >
            {t("web.topsPage.tabWeek")}
          </button>
          <button
            type="button"
            className={window === "all" ? "discovery-window-tab is-active" : "discovery-window-tab"}
            role="tab"
            aria-selected={window === "all"}
            onClick={() => {
              setWindow("all");
            }}
          >
            {t("web.topsPage.tabAllTime")}
          </button>
        </div>

        <div className="panel-card">
          {isLoading ? (
            <p className="muted-copy">{t("chat.loading")}</p>
          ) : items.length > 0 ? (
            <EntityRankList items={items} showRecentVotes={window === "week"} />
          ) : (
            <p className="muted-copy">{t("web.topsPage.comingSoon")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
