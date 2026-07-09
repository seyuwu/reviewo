"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { formatTopCategoryLabel } from "../../i18n/top-category-label";
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
  initialSort?: TopListSort | undefined;
  pageTitle?: string | undefined;
}

export function TopsHubView({
  activeCategorySlug = null,
  categories = [],
  initialItems,
  initialSort = "recent",
  pageTitle
}: TopsHubViewProps) {
  const t = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSort = parseTopListSort(searchParams.get("sort") ?? initialSort);
  const hasInitialData = initialItems !== undefined && urlSort === initialSort;
  const [sort, setSort] = useState<TopListSort>(urlSort);
  const [items, setItems] = useState<TopListItem[]>(initialItems ?? []);
  const [loadedSort, setLoadedSort] = useState<TopListSort | null>(hasInitialData ? urlSort : null);
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const heading = useMemo(() => {
    if (activeCategorySlug) {
      const category = categories.find((item) => item.slug === activeCategorySlug);

      if (category) {
        return formatTopCategoryLabel(t, category.slug, category.title);
      }
    }

    return pageTitle ?? t("web.userTops.hubTitle");
  }, [activeCategorySlug, categories, pageTitle, t]);

  useEffect(() => {
    setSort(urlSort);
  }, [urlSort]);

  useEffect(() => {
    if (hasInitialData && loadedSort === urlSort) {
      setItems(initialItems ?? []);
      return;
    }

    let cancelled = false;
    setIsLoading(loadedSort !== urlSort);

    const fetchItems = activeCategorySlug
      ? fetchTopsByCategory(activeCategorySlug, 20, undefined, urlSort)
      : fetchRecentTops(20, undefined, urlSort);

    void fetchItems
      .then((response) => {
        if (!cancelled) {
          setItems(response.items);
          setLoadedSort(urlSort);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoadedSort(urlSort);
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
  }, [activeCategorySlug, hasInitialData, initialItems, loadedSort, urlSort]);

  function handleSortChange(nextSort: TopListSort) {
    const params = new URLSearchParams(searchParams.toString());
    const queryValue = topListSortToQueryValue(nextSort);

    if (queryValue) {
      params.set("sort", queryValue);
    } else {
      params.delete("sort");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    setSort(nextSort);
  }

  return (
    <div className="home-hub">
      <section className="home-hub-card" aria-labelledby="user-tops-hub-heading">
        <header className="home-hub-header">
          <h1 id="user-tops-hub-heading">{heading}</h1>
          <p className="home-hub-subtitle">{t("web.userTops.hubSubtitle")}</p>
        </header>

        <TopHubTabs activeTab="user" />

        <div className="home-hub-actions">
          <Link className="button-primary" href="/tops/new">
            {t("web.userTops.createCta")}
          </Link>
        </div>

        <TopCategoryFilter activeSlug={activeCategorySlug} categories={categories} />

        <TopSortTabs
          activeSort={sort}
          ariaLabel={t("web.userTops.sortLabel")}
          onSortChange={handleSortChange}
        />

        <div className="panel-card">
          {isLoading ? (
            <p className="muted-copy">{t("chat.loading")}</p>
          ) : (
            <TopsList
              emptyMessage={t("web.userTops.hubEmpty")}
              items={items}
              showCategory={!activeCategorySlug}
              showEngagement
            />
          )}
        </div>
      </section>
    </div>
  );
}
