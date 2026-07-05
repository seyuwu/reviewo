"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { buildCompareSlug } from "@reviewo/shared";

import { useEntitySearch } from "../../home-search/hooks/use-entity-search";
import type { SearchEntityResult } from "../../home-search/types/search-entities";
import { useTranslation } from "../../i18n/locale-provider";

export function ComparePairPicker() {
  const t = useTranslation();
  const router = useRouter();
  const inputId = useId();
  const [leftEntity, setLeftEntity] = useState<SearchEntityResult | null>(null);
  const [query, setQuery] = useState("");
  const {
    data: searchData,
    debouncedQuery,
    isDebouncing,
    isError,
    isFetching,
    isPending,
    trimmedQuery
  } = useEntitySearch(query);

  const results = (searchData?.results ?? []).filter(
    (result) => result.id !== leftEntity?.id
  );
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

  function handleSelect(result: SearchEntityResult): void {
    if (!leftEntity) {
      setLeftEntity(result);
      setQuery("");
      return;
    }

    router.push(`/compare/${buildCompareSlug(leftEntity.slug, result.slug)}`);
  }

  return (
    <div className="discovery-pair-picker panel-card">
      {leftEntity ? (
        <div className="discovery-pair-picker-selected">
          <span className="discovery-pair-picker-chip">{leftEntity.title}</span>
          <button
            type="button"
            className="discovery-pair-picker-clear"
            onClick={() => {
              setLeftEntity(null);
              setQuery("");
            }}
          >
            {t("web.battlesHub.clearPick")}
          </button>
        </div>
      ) : null}

      <form
        className="search-form home-hub-form home-hub-input-row"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          {leftEntity ? t("web.battlesHub.pickSecond") : t("web.battlesHub.pickFirst")}
        </label>
        <input
          id={inputId}
          type="search"
          autoComplete="off"
          maxLength={200}
          placeholder={
            leftEntity ? t("web.battlesHub.pickSecond") : t("web.battlesHub.pickFirst")
          }
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </form>

      {isSearchActive ? (
        <div className="discovery-pair-picker-results" aria-live="polite">
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
            <ul className="home-search-hit-list">
              {results.slice(0, 6).map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    className="home-search-hit discovery-pair-picker-hit"
                    onClick={() => {
                      handleSelect(result);
                    }}
                  >
                    <span className="home-search-hit-main">
                      <span className="home-search-hit-title">{result.title}</span>
                      {result.canonicalUrl ? (
                        <span className="home-search-hit-url">{formatHostname(result.canonicalUrl)}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {showEmptyState ? (
            <p className="home-hub-search-status">{t("web.home.noResults", { query: debouncedQuery })}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatHostname(canonicalUrl: string): string {
  try {
    return new URL(canonicalUrl).hostname;
  } catch {
    return canonicalUrl;
  }
}
