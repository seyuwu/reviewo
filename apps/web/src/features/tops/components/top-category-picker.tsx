"use client";

import { useEffect, useId, useMemo, useState } from "react";

import { formatTopCategoryLabel } from "../../i18n/top-category-label";
import { useTranslation } from "../../i18n/locale-provider";
import { filterTopCategories } from "../lib/top-category-search";
import type { TopCategory } from "../types/tops";

interface TopCategoryPickerProps {
  categories: TopCategory[];
  categoryId: string;
  disabled?: boolean;
  onCategoryChange: (categoryId: string) => void;
}

export function TopCategoryPicker({
  categories,
  categoryId,
  disabled = false,
  onCategoryChange
}: TopCategoryPickerProps) {
  const t = useTranslation();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [isEditing, setIsEditing] = useState(() => categoryId.length === 0);

  useEffect(() => {
    if (categoryId) {
      setIsEditing(false);
    }
  }, [categoryId]);

  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;
  const normalizedQuery = query.trim().toLowerCase();

  const filteredCategories = useMemo(
    () => filterTopCategories(categories, query, t),
    [categories, query, t]
  );

  function handleSelect(nextCategoryId: string) {
    onCategoryChange(nextCategoryId);
    setQuery("");
    setIsEditing(false);
  }

  if (selectedCategory && !isEditing) {
    return (
      <div className="top-category-picker">
        <span className="field-label">{t("web.userTops.categoryLabel")}</span>
        <div className="top-category-picker-selected">
          <span className="top-category-picker-chip">
            {formatTopCategoryLabel(t, selectedCategory.slug, selectedCategory.title)}
          </span>
          {!disabled ? (
            <button
              type="button"
              className="top-category-picker-change"
              onClick={() => {
                setIsEditing(true);
                setQuery("");
              }}
            >
              {t("web.userTops.categoryChange")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="top-category-picker">
      <label className="field" htmlFor={inputId}>
        <span>{t("web.userTops.categoryLabel")}</span>
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          disabled={disabled}
          maxLength={80}
          placeholder={t("web.userTops.categorySearchPlaceholder")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </label>

      <div className="top-category-picker-results top-category-picker-results-scroll" aria-live="polite">
        {filteredCategories.length > 0 ? (
          <ul className="home-search-hit-list">
            {filteredCategories.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  className="home-search-hit top-category-picker-hit"
                  disabled={disabled}
                  onClick={() => {
                    handleSelect(category.id);
                  }}
                >
                  <span className="home-search-hit-title">
                    {formatTopCategoryLabel(t, category.slug, category.title)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : normalizedQuery ? (
          <p className="muted-copy">{t("web.userTops.categoryNoMatches")}</p>
        ) : (
          <p className="muted-copy">{t("web.userTops.categorySearchHint")}</p>
        )}
      </div>
    </div>
  );
}
