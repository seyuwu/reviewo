import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { searchEntities } from "../api/search-entities";

const MIN_SEARCH_QUERY_LENGTH = 1;
const SEARCH_DEBOUNCE_MS = 250;

export function useEntitySearch(query: string) {
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);

  return useQuery({
    enabled: debouncedQuery.length >= MIN_SEARCH_QUERY_LENGTH,
    queryFn: () => searchEntities(debouncedQuery),
    queryKey: ["home-search", debouncedQuery]
  });
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
