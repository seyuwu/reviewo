import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { searchEntities } from "../api/search-entities";

const MIN_SEARCH_QUERY_LENGTH = 1;
const SEARCH_DEBOUNCE_MS = 250;

export function useEntitySearch(query: string) {
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, SEARCH_DEBOUNCE_MS);
  const isDebouncing = trimmedQuery.length > 0 && trimmedQuery !== debouncedQuery;

  const searchQuery = useQuery({
    enabled: debouncedQuery.length >= MIN_SEARCH_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    queryFn: () => searchEntities(debouncedQuery),
    queryKey: ["home-search", debouncedQuery]
  });

  return {
    ...searchQuery,
    debouncedQuery,
    isDebouncing,
    trimmedQuery
  };
}

function useDebouncedValue<TValue>(value: TValue, delayMs: number): TValue {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}
