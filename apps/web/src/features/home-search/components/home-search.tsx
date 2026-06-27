"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";

import { useEntitySearch } from "../hooks/use-entity-search";
import type { SearchEntityResult } from "../types/search-entities";

export function HomeSearch() {
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
      <p className="eyebrow">Reviewo</p>
      <h1 id="home-search-heading">Что хотите оценить?</h1>
      <p className="hero-copy">
        Найдите сайт, продукт, компанию или любое другое явление. Reviewo покажет, что о нем думают
        люди.
      </p>

      <form className="search-form" role="search" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={inputId}>
          Search entities
        </label>
        <input
          id={inputId}
          autoComplete="off"
          maxLength={200}
          placeholder="Например: github.com, iPhone, Cursor..."
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <button type="submit" disabled={!trimmedQuery}>
          Search
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
                Searching...
              </div>
            ) : null}

            {isError ? (
              <div className="search-state search-state-error ui-fade-soft">
                Search is temporarily unavailable. Please try again.
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
                No entities found for "{debouncedQuery}".
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
  return (
    <div className="search-state">
      <span className="state-dot" aria-hidden="true" />
      Start typing to search the public opinion layer.
    </div>
  );
}

interface SearchResultsProps {
  query: string;
  results: SearchEntityResult[];
}

function SearchResults({ query, results }: SearchResultsProps) {
  return (
    <div className="results-list" aria-label="Search results">
      {results.map((entity) => (
        <article className="result-card" key={entity.id}>
          <div>
            <p className="result-type">{entity.type}</p>
            <h2>{entity.title}</h2>
            <p>{entity.description ?? entity.canonicalUrl ?? entity.slug}</p>
          </div>
          <Link
            className="result-action"
            href={`/entities/${entity.id}?q=${encodeURIComponent(query)}`}
          >
            Open
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
  const createEntityHref = `/entities/new?query=${encodeURIComponent(query)}`;

  return (
    <div className="create-hint ui-fade-soft">
      <div>
        <p className="result-type">No entity found</p>
        <h2>Create a new page for "{query}"</h2>
        <p>Start a minimal entity page and let the backend validate the submitted data.</p>
      </div>
      <Link className="primary-link" href={createEntityHref}>
        Create page
      </Link>
    </div>
  );
}
