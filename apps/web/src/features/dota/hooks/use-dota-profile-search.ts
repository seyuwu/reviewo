import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { searchDotaProfiles } from "../api/dota-api";

const MIN_SEARCH_QUERY_LENGTH = 1;
const SEARCH_DEBOUNCE_MS = 250;

export function useDotaProfileSearch(query: string) {
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, SEARCH_DEBOUNCE_MS);
  const isDebouncing = trimmedQuery.length > 0 && trimmedQuery !== debouncedQuery;

  const searchQuery = useQuery({
    enabled: debouncedQuery.length >= MIN_SEARCH_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    queryFn: () => searchDotaProfiles(debouncedQuery),
    queryKey: ["dota-profile-search", debouncedQuery]
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
