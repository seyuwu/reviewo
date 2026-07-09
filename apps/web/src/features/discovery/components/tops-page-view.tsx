"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchTopRatings } from "../api/discovery-api";
import { SystemTopCatalogGrid } from "../../tops/components/system-top-catalog-grid";
import { TopHubTabs, type TopHubTab } from "../../tops/components/top-hub-tabs";
import { fetchSystemTopsCatalog } from "../../tops/api/tops-api";
import type { SystemTopCatalogItem } from "../../tops/types/tops";
import type { DiscoveryEntityRankItem, DiscoveryRatingsSort } from "../types/discovery";
import { useTranslation } from "../../i18n/locale-provider";
import { EntityRankList } from "./entity-rank-list";

type TopHubView = TopHubTab;

function readHubView(tab: string | null): TopHubView {
  return tab === "catalog" ? "catalog" : "ratings";
}

interface TopsPageViewProps {
  initialCatalog?: SystemTopCatalogItem[] | undefined;
  initialItems?: DiscoveryEntityRankItem[] | undefined;
  initialSort?: DiscoveryRatingsSort | undefined;
}

export function TopsPageView({
  initialCatalog,
  initialItems,
  initialSort = "votes"
}: TopsPageViewProps) {
  const t = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasInitialData = initialItems !== undefined;
  const [hubView, setHubView] = useState<TopHubView>(() => readHubView(searchParams.get("tab")));
  const [sort, setSort] = useState<DiscoveryRatingsSort>(initialSort);
  const [items, setItems] = useState<DiscoveryEntityRankItem[]>(initialItems ?? []);
  const [catalog, setCatalog] = useState<SystemTopCatalogItem[]>(initialCatalog ?? []);
  const [loadedSort, setLoadedSort] = useState<DiscoveryRatingsSort | null>(
    hasInitialData ? initialSort : null
  );
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    setHubView(readHubView(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    void fetchSystemTopsCatalog()
      .then((response) => {
        if (!cancelled) {
          setCatalog(response.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalog([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hubView !== "ratings") {
      return;
    }

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
  }, [hubView, loadedSort, sort]);

  function selectRatingsTab() {
    setHubView("ratings");
    router.replace("/top", { scroll: false });
  }

  function selectCatalogTab() {
    setHubView("catalog");
    router.replace("/top?tab=catalog", { scroll: false });
  }

  return (
    <div className="home-hub">
      <section className="home-hub-card" aria-label={t("web.topsPage.title")}>
        <TopHubTabs
          activeTab={hubView}
          onSelectCatalog={selectCatalogTab}
          onSelectRatings={selectRatingsTab}
        />

        {hubView === "ratings" ? (
          <>
            <div className="discovery-window-tabs" role="tablist" aria-label={t("web.topsPage.tabRatings")}>
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
          </>
        ) : (
          <div className="panel-card">
            <SystemTopCatalogGrid items={catalog} />
          </div>
        )}
      </section>
    </div>
  );
}
