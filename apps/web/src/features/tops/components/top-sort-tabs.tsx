"use client";

import type { TranslateFn } from "@reviewo/i18n";

import { useTranslation } from "../../i18n/locale-provider";
import { TOP_LIST_SORTS, type TopListSort } from "../lib/top-list-sort";

interface TopSortTabsProps {
  activeSort: TopListSort;
  ariaLabel: string;
  onSortChange: (sort: TopListSort) => void;
}

export function TopSortTabs({ activeSort, ariaLabel, onSortChange }: TopSortTabsProps) {
  const t = useTranslation();

  return (
    <div className="discovery-window-tabs top-sort-tabs" role="tablist" aria-label={ariaLabel}>
      {TOP_LIST_SORTS.map((sort) => (
        <button
          key={sort}
          type="button"
          className={activeSort === sort ? "discovery-window-tab is-active" : "discovery-window-tab"}
          role="tab"
          aria-selected={activeSort === sort}
          onClick={() => {
            onSortChange(sort);
          }}
        >
          {formatTopListSortLabel(sort, t)}
        </button>
      ))}
    </div>
  );
}

function formatTopListSortLabel(sort: TopListSort, t: TranslateFn): string {
  if (sort === "recent") {
    return t("web.userTops.sortRecent");
  }

  if (sort === "likes") {
    return t("web.userTops.sortLikes");
  }

  if (sort === "comments") {
    return t("web.userTops.sortComments");
  }

  if (sort === "views") {
    return t("web.userTops.sortViews");
  }

  return t("web.userTops.sortForks");
}
