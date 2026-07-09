"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { formatTopCategoryLabel } from "../../i18n/top-category-label";
import { useTranslation } from "../../i18n/locale-provider";
import { filterTopCategories } from "../lib/top-category-search";
import { parseTopListSort, topListSortToQueryValue } from "../lib/top-list-sort";
import type { TopCategory } from "../types/tops";

interface TopCategoryFilterProps {
  activeSlug?: string | null;
  categories: TopCategory[];
}

export function TopCategoryFilter({ activeSlug = null, categories }: TopCategoryFilterProps) {
  const t = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sortQuery = topListSortToQueryValue(parseTopListSort(searchParams.get("sort")));
  const sortSuffix = sortQuery ? `?sort=${sortQuery}` : "";

  const activeCategory = categories.find((category) => category.slug === activeSlug) ?? null;
  const triggerLabel = activeCategory
    ? formatTopCategoryLabel(t, activeCategory.slug, activeCategory.title)
    : t("web.userTops.categoryFilterAll");

  const filteredCategories = useMemo(
    () => filterTopCategories(categories, query, t),
    [categories, query, t]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function navigateToCategory(slug: string | null) {
    const href = slug ? `/tops/category/${slug}${sortSuffix}` : `/tops${sortSuffix}`;

    if (pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "") !== href) {
      router.push(href);
    }

    setIsOpen(false);
    setQuery("");
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="top-category-filter" ref={rootRef}>
      <span className="top-category-filter-label" id={`${listboxId}-label`}>
        {t("web.userTops.categoryFilterLabel")}
      </span>
      <button
        type="button"
        className="top-category-filter-trigger"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${listboxId}-label`}
        role="combobox"
        onClick={() => {
          setIsOpen((open) => !open);
        }}
      >
        <span>{triggerLabel}</span>
        <span aria-hidden="true" className="top-category-filter-chevron">
          ▾
        </span>
      </button>

      {isOpen ? (
        <div className="top-category-filter-panel" id={listboxId} role="listbox">
          <label className="top-category-filter-search">
            <span className="sr-only">{t("web.userTops.categorySearchPlaceholder")}</span>
            <input
              ref={searchInputRef}
              type="search"
              autoComplete="off"
              placeholder={t("web.userTops.categorySearchPlaceholder")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </label>

          <ul className="top-category-filter-list">
            <li role="option" aria-selected={!activeSlug}>
              <button
                type="button"
                className={
                  activeSlug ? "top-category-filter-option" : "top-category-filter-option is-active"
                }
                onClick={() => {
                  navigateToCategory(null);
                }}
              >
                {t("web.userTops.categoryFilterAll")}
              </button>
            </li>
            {filteredCategories.map((category) => (
              <li key={category.id} role="option" aria-selected={activeSlug === category.slug}>
                <button
                  type="button"
                  className={
                    activeSlug === category.slug
                      ? "top-category-filter-option is-active"
                      : "top-category-filter-option"
                  }
                  onClick={() => {
                    navigateToCategory(category.slug);
                  }}
                >
                  {formatTopCategoryLabel(t, category.slug, category.title)}
                </button>
              </li>
            ))}
          </ul>

          {filteredCategories.length === 0 && query.trim() ? (
            <p className="top-category-filter-empty">{t("web.userTops.categoryNoMatches")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
