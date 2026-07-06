"use client";

import { useEffect, useState } from "react";

import { fetchTopRatings } from "../api/discovery-api";
import type { DiscoveryEntityRankItem, DiscoveryRatingsSort } from "../types/discovery";
import { useTranslation } from "../../i18n/locale-provider";
import { EntityRankList } from "./entity-rank-list";

interface TopsPageViewProps {
  initialItems?: DiscoveryEntityRankItem[] | undefined;
  initialSort?: DiscoveryRatingsSort | undefined;
}

export function TopsPageView({ initialItems, initialSort = "votes" }: TopsPageViewProps) {
  const t = useTranslation();
  const hasInitialData = initialItems !== undefined;
  const [sort, setSort] = useState<DiscoveryRatingsSort>(initialSort);
  const [items, setItems] = useState<DiscoveryEntityRankItem[]>(initialItems ?? []);
  const [loadedSort, setLoadedSort] = useState<DiscoveryRatingsSort | null>(
    hasInitialData ? initialSort : null
  );
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(loadedSort !== sort);

    void fetchTopRatings(sort, 20)
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
          setLoadedSort(sort);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoadedSort(sort);
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
  }, [sort]);

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
            className={sort === "reliability" ? "discovery-window-tab is-active" : "discovery-window-tab"}
            role="tab"
            aria-selected={sort === "reliability"}
            onClick={() => {
              setSort("reliability");
            }}
          >
            {t("web.topsPage.tabReliability")}
          </button>
          <button
            type="button"
            className={sort === "votes" ? "discovery-window-tab is-active" : "discovery-window-tab"}
            role="tab"
            aria-selected={sort === "votes"}
            onClick={() => {
              setSort("votes");
            }}
          >
            {t("web.topsPage.tabVotes")}
          </button>
        </div>

        <div className="panel-card">
          {isLoading ? (
            <p className="muted-copy">{t("chat.loading")}</p>
          ) : items.length > 0 ? (
            <EntityRankList
              items={items}
              showReliability={sort === "reliability"}
              showVoteCount={sort === "votes"}
            />
          ) : (
            <p className="muted-copy">{t("web.topsPage.comingSoon")}</p>
          )}
        </div>
      </section>
    </div>
  );
}
