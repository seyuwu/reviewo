export const TOP_LIST_SORTS = ["recent", "likes", "comments", "views", "forks"] as const;

export type TopListSort = (typeof TOP_LIST_SORTS)[number];

export function normalizeTopListSort(value?: string | null): TopListSort {
  if (value === "popular") {
    return "likes";
  }

  if (value && TOP_LIST_SORTS.includes(value as TopListSort)) {
    return value as TopListSort;
  }

  return "recent";
}

export function buildTopListOrderBy(sort: TopListSort) {
  if (sort === "likes") {
    return [{ likes: { _count: "desc" as const } }, { createdAt: "desc" as const }, { id: "desc" as const }];
  }

  if (sort === "comments") {
    return [
      { comments: { _count: "desc" as const } },
      { createdAt: "desc" as const },
      { id: "desc" as const }
    ];
  }

  if (sort === "views") {
    return [{ views: { _count: "desc" as const } }, { createdAt: "desc" as const }, { id: "desc" as const }];
  }

  if (sort === "forks") {
    return [{ forks: { _count: "desc" as const } }, { createdAt: "desc" as const }, { id: "desc" as const }];
  }

  return [{ createdAt: "desc" as const }, { id: "desc" as const }];
}
