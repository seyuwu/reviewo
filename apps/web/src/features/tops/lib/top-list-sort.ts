export const TOP_LIST_SORTS = ["recent", "likes", "comments", "views", "forks"] as const;

export type TopListSort = (typeof TOP_LIST_SORTS)[number];

export function parseTopListSort(value?: string | null): TopListSort {
  if (value === "popular") {
    return "likes";
  }

  if (value && TOP_LIST_SORTS.includes(value as TopListSort)) {
    return value as TopListSort;
  }

  return "recent";
}

export function topListSortToQueryValue(sort: TopListSort): string | null {
  return sort === "recent" ? null : sort;
}
