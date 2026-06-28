"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";

import { useTranslation } from "../../i18n/locale-provider";
import { formatEntityTypeLabel } from "../../i18n/entity-type-label";
import { useEntitySearch } from "../hooks/use-entity-search";
import type { SearchEntityResult } from "../types/search-entities";

export function HomeSearch() {
  const t = useTranslation();
  const inputId = useId();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const [query, setQuery] = useState(initialQuery);
  const {
    data: searchData,
    debouncedQuery,
    isDebouncing,
    isError,
    isFetching,
    isPending,
    trimmedQuery
  } = useEntitySearch(query);

  useEffect(() => {
    setQuery(searchParams.get("q")?.trim() ?? "");
  }, [searchParams]);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <section className="home-search-card" aria-labelledby="home-search-heading">
      <p className="eyebrow">{t("brand.name")}</p>
      <h1 id="home-search-heading">{t("web.home.title")}</h1>
      <p className="hero-copy">{t("web.home.subtitle")}</p>

      <form className="search-form" role="search" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={inputId}>
          {t("web.home.searchLabel")}
        </label>
        <input
          id={inputId}
          autoComplete="off"
          maxLength={200}
          placeholder={t("web.home.searchPlaceholder")}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <button type="submit" disabled={!trimmedQuery}>
          {t("common.search")}
        </button>
      </form>

      <div
        className={`search-panel${isSearchActive ? " search-panel-active" : ""}${isFetching ? " search-panel-fetching" : ""}`}
        aria-live="polite"
      >
        {!isSearchActive ? <SearchIdleState /> : null}

        {isSearchActive ? (
          <div className="search-panel-body">
            {isWaitingForResults && !showResults ? (
              <div className="search-state search-state-loading">
                <span className="state-dot state-dot-loading" aria-hidden="true" />
                {t("web.home.searching")}
              </div>
            ) : null}

            {isError ? (
              <div className="search-state search-state-error ui-fade-soft">
                {t("web.home.searchError")}
              </div>
            ) : null}

            {showResults ? (
              <div className={`search-results-stage${isFetching ? " is-refreshing" : ""}`}>
                <SearchResults query={debouncedQuery || trimmedQuery} results={results} />
              </div>
            ) : null}

            {showEmptyState && !shouldShowCreateHint ? (
              <div className="search-state ui-fade-soft">
                <span className="state-dot" aria-hidden="true" />
                {t("web.home.noResults", { query: debouncedQuery })}
              </div>
            ) : null}

            {shouldShowCreateHint ? (
              <CreateEntityHint query={searchData?.query ?? debouncedQuery} />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SearchIdleState() {
  const t = useTranslation();

  return (
    <div className="search-state">
      <span className="state-dot" aria-hidden="true" />
      {t("web.home.idleHint")}
    </div>
  );
}

interface SearchResultsProps {
  query: string;
  results: SearchEntityResult[];
}

function SearchResults({ query, results }: SearchResultsProps) {
  const t = useTranslation();

  return (
    <div className="results-list" aria-label={t("web.home.resultsAriaLabel")}>
      {results.map((entity) => (
        <article className="result-card" key={entity.id}>
          <div>
            <p className="result-type">{formatEntityTypeLabel(t, entity.type)}</p>
            <h2>{entity.title}</h2>
            <p>{entity.description ?? entity.canonicalUrl ?? entity.slug}</p>
          </div>
          <Link
            className="result-action"
            href={`/entities/${entity.id}?q=${encodeURIComponent(query)}`}
          >
            {t("common.open")}
          </Link>
        </article>
      ))}
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
    <div className="create-hint ui-fade-soft">
      <div>
        <p className="result-type">{t("web.home.createHint.type")}</p>
        <h2>{t("web.home.createHint.title", { query })}</h2>
        <p>{t("web.home.createHint.body")}</p>
      </div>
      <Link className="primary-link" href={createEntityHref}>
        {t("web.home.createHint.action")}
      </Link>
    </div>
  );
}
