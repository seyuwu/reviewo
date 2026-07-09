import Link from "next/link";

import { useTranslation } from "../../i18n/locale-provider";
import type { SearchEntitiesResponse } from "../types/search-entities";
import { SearchHitList } from "./search-hit-list";

interface EntitySearchResultsPanelProps {
  debouncedQuery: string;
  isDebouncing: boolean;
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  searchData: SearchEntitiesResponse | undefined;
  trimmedQuery: string;
}

export function EntitySearchResultsPanel({
  debouncedQuery,
  isDebouncing,
  isError,
  isFetching,
  isPending,
  searchData,
  trimmedQuery
}: EntitySearchResultsPanelProps) {
  const t = useTranslation();
  const results = searchData?.results ?? [];
  const isSearchActive = trimmedQuery.length > 0;
  const isWaitingForResults =
    isSearchActive && (isDebouncing || isPending || (isFetching && results.length === 0));
  const showResults = isSearchActive && !isError && results.length > 0;
  const showEmptyState =
    isSearchActive &&
    !isDebouncing &&
    !isPending &&
    !isFetching &&
    !isError &&
    results.length === 0;
  const shouldShowCreateHint =
    Boolean(searchData?.canCreateEntity) && showEmptyState && debouncedQuery.length > 0;

  if (!isSearchActive) {
    return null;
  }

  return (
    <div
      className={`home-hub-search-output${isFetching ? " home-hub-search-output-fetching" : ""}`}
      aria-live="polite"
    >
      {isWaitingForResults && !showResults ? (
        <p className="home-hub-search-status">
          <span className="state-dot state-dot-loading" aria-hidden="true" />
          {t("web.home.searching")}
        </p>
      ) : null}

      {isError ? (
        <p className="home-hub-search-status home-hub-search-status-error">
          {t("web.home.searchError")}
        </p>
      ) : null}

      {showResults ? (
        <SearchHitList query={debouncedQuery || trimmedQuery} results={results} />
      ) : null}

      {showEmptyState && !shouldShowCreateHint ? (
        <p className="home-hub-search-status">
          {t("web.home.noResults", { query: debouncedQuery })}
        </p>
      ) : null}

      {shouldShowCreateHint ? (
        <CreateEntityHint query={searchData?.query ?? debouncedQuery} />
      ) : null}
    </div>
  );
}

interface CreateEntityHintProps {
  query: string;
}

function CreateEntityHint({ query }: CreateEntityHintProps) {
  const t = useTranslation();
  const createEntityHref = `/entities/new?query=${encodeURIComponent(query)}`;

  return (
    <div className="home-search-callout ui-fade-soft">
      <p className="home-search-callout-title">{t("web.home.createHint.title", { query })}</p>
      <p className="home-search-callout-copy">{t("web.home.createHint.body")}</p>
      <Link className="primary-link" href={createEntityHref}>
        {t("web.home.createHint.action")}
      </Link>
    </div>
  );
}
