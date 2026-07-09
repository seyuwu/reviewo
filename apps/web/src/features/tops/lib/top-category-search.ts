import type { TranslateFn } from "@reviewo/i18n";

import { formatTopCategoryLabel } from "../../i18n/top-category-label";
import type { TopCategory } from "../types/tops";

export function filterTopCategories(
  categories: TopCategory[],
  query: string,
  t?: TranslateFn
): TopCategory[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return categories;
  }

  return categories.filter((category) => {
    const localizedTitle = t ? formatTopCategoryLabel(t, category.slug, category.title) : category.title;

    return (
      localizedTitle.toLowerCase().includes(normalizedQuery) ||
      category.title.toLowerCase().includes(normalizedQuery) ||
      category.slug.includes(normalizedQuery.replace(/\s+/g, "-"))
    );
  });
}
