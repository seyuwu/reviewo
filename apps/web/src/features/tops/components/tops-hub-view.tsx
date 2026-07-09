"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/locale-provider";
import { fetchRecentTops, fetchTopsByCategory } from "../api/tops-api";
import { parseTopListSort, topListSortToQueryValue, type TopListSort } from "../lib/top-list-sort";
import type { TopCategory, TopListItem } from "../types/tops";
import { TopCategoryFilter } from "./top-category-filter";
import { TopHubTabs } from "./top-hub-tabs";
import { TopSortTabs } from "./top-sort-tabs";
import { TopsList } from "./tops-list";

interface TopsHubViewProps {
  activeCategorySlug?: string | null;
  categories?: TopCategory[] | undefined;
  initialItems?: TopListItem[] | undefined;
  initialSearchQuery?: string | undefined;
  initialSort?: TopListSort | undefined;
}

export function TopsHubView({
  activeCategorySlug = null,
  categories = [],
  initialItems,
  initialSearchQuery = "",
  initialSort = "recent"
}: TopsHubViewProps) {
  const t = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSort = parseTopListSort(searchParams.get("sort") ?? initialSort);
  const urlQuery = (searchParams.get("q") ?? initialSearchQuery).trim();
  const urlShuffle = searchParams.get("shuffle") ?? "";
  const hasInitialData =
    initialItems !== undefined &&
    urlSort === initialSort &&
    urlQuery === initialSearchQuery.trim() &&
    !urlShuffle;
  const [sort, setSort] = useState<TopListSort>(urlSort);
  const [searchInput, setSearchInput] = useState(urlQuery);
  const [items, setItems] = useState<TopListItem[]>(initialItems ?? []);
  const [loadedSort, setLoadedSort] = useState<TopListSort | null>(hasInitialData ? urlSort : null);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(
    hasInitialData ? urlQuery : null
  );
  const [loadedShuffle, setLoadedShuffle] = useState<string | null>(hasInitialData ? "" : null);
  const [isLoading, setIsLoading] = useState(!hasInitialData);

  useEffect(() => {
    setSort(urlSort);
  }, [urlSort]);

  useEffect(() => {
    setSearchInput(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const trimmed = searchInput.trim();

      if (trimmed === urlQuery) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());

      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [pathname, router, searchInput, searchParams, urlQuery]);

  useEffect(() => {
    if (
      hasInitialData &&
      loadedSort === urlSort &&
      loadedQuery === urlQuery &&
      loadedShuffle === urlShuffle
    ) {
      setItems(initialItems ?? []);
      return;
    }

    let cancelled = false;
    setIsLoading(
      loadedSort !== urlSort || loadedQuery !== urlQuery || loadedShuffle !== urlShuffle
    );

    const fetchItems = activeCategorySlug
      ? fetchTopsByCategory(activeCategorySlug, 20, undefined, urlSort, urlQuery || undefined)
      : fetchRecentTops(20, undefined, urlSort, urlQuery || undefined);

    void fetchItems
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
          setLoadedSort(urlSort);
          setLoadedQuery(urlQuery);
          setLoadedShuffle(urlShuffle);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedSort(urlSort);
          setLoadedQuery(urlQuery);
          setLoadedShuffle(urlShuffle);
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
  }, [
    activeCategorySlug,
    hasInitialData,
    initialItems,
    loadedQuery,
    loadedShuffle,
    loadedSort,
    urlQuery,
    urlShuffle,
    urlSort
  ]);

  function handleSortChange(nextSort: TopListSort) {
    const params = new URLSearchParams(searchParams.toString());
    const queryValue = topListSortToQueryValue(nextSort);

    if (queryValue) {
      params.set("sort", queryValue);
    } else {
      params.delete("sort");
    }

    if (nextSort === "random") {
      params.set("shuffle", String(Date.now()));
    } else {
      params.delete("shuffle");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setSort(nextSort);
  }

  const emptyMessage = urlQuery ? t("web.userTops.searchNoMatches") : t("web.userTops.hubEmpty");

  return (
    <div className="home-hub">
      <section className="home-hub-card tops-hub-card" aria-label={t("web.userTops.hubTitle")}>
        <div className="tops-hub-topbar">
          <TopHubTabs activeTab="user" />
          <Link className="button-primary tops-hub-create-cta" href="/tops/new">
            {t("web.userTops.createCta")}
          </Link>
        </div>

        <label className="tops-hub-search">
          <span className="sr-only">{t("web.userTops.searchTopsPlaceholder")}</span>
          <span className="tops-hub-search-field">
            <span aria-hidden="true" className="tops-hub-search-icon">
              <svg fill="none" height="18" viewBox="0 0 20 20" width="18">
                <path
                  d="M8.75 14.5a5.75 5.75 0 1 0 0-11.5 5.75 5.75 0 0 0 0 11.5Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.75"
                />
                <path
                  d="m13.5 13.5 3.75 3.75"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.75"
                />
              </svg>
            </span>
            <input
              type="search"
              autoComplete="off"
              placeholder={t("web.userTops.searchTopsPlaceholder")}
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
              }}
            />
          </span>
        </label>

        <div className="tops-hub-controls">
          <TopCategoryFilter activeSlug={activeCategorySlug} categories={categories} />
          <div className="tops-hub-sort-row">
            <TopSortTabs
              activeSort={sort}
              ariaLabel={t("web.userTops.sortLabel")}
              onSortChange={handleSortChange}
            />
          </div>
        </div>

        <div className="panel-card tops-hub-results">
          {isLoading ? (
            <p className="muted-copy">{t("chat.loading")}</p>
          ) : (
            <TopsList emptyMessage={emptyMessage} items={items} showCategory={!activeCategorySlug} showEngagement />
          )}
        </div>
      </section>
    </div>
  );
}
