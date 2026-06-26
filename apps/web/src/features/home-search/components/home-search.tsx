"use client";

import { FormEvent, useId, useState } from "react";

import { useEntitySearch } from "../hooks/use-entity-search";
import type { SearchEntityResult } from "../types/search-entities";

export function HomeSearch() {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const searchQuery = useEntitySearch(query);
  const results = searchQuery.data?.results ?? [];
  const shouldShowCreateHint =
    Boolean(searchQuery.data?.canCreateEntity) &&
    trimmedQuery.length > 0 &&
    !searchQuery.isFetching;

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

      <div className="search-panel" aria-live="polite">
        {!trimmedQuery ? <SearchIdleState /> : null}
        {trimmedQuery && searchQuery.isFetching ? <SearchLoadingState /> : null}
        {trimmedQuery && searchQuery.isError ? <SearchErrorState /> : null}
        {trimmedQuery && !searchQuery.isFetching && !searchQuery.isError && results.length > 0 ? (
          <SearchResults results={results} />
        ) : null}
        {shouldShowCreateHint ? (
          <CreateEntityHint query={searchQuery.data?.query ?? trimmedQuery} />
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

function SearchLoadingState() {
  return (
    <div className="search-state">
      <span className="state-dot state-dot-loading" aria-hidden="true" />
      Searching...
    </div>
  );
}

function SearchErrorState() {
  return (
    <div className="search-state search-state-error">
      Search is temporarily unavailable. Please try again.
    </div>
  );
}

interface SearchResultsProps {
  results: SearchEntityResult[];
}

function SearchResults({ results }: SearchResultsProps) {
  return (
    <div className="results-list" aria-label="Search results">
      {results.map((entity) => (
        <article className="result-card" key={entity.id}>
          <div>
            <p className="result-type">{entity.type}</p>
            <h2>{entity.title}</h2>
            <p>{entity.description ?? entity.canonicalUrl ?? entity.slug}</p>
          </div>
          <span className="result-action">Entity page later</span>
        </article>
      ))}
    </div>
  );
}

interface CreateEntityHintProps {
  query: string;
}

function CreateEntityHint({ query }: CreateEntityHintProps) {
  return (
    <div className="create-hint">
      <div>
        <p className="result-type">No entity found</p>
        <h2>Create a new page for "{query}"</h2>
        <p>Entity creation is planned for the next dedicated web stage.</p>
      </div>
      <button type="button" disabled>
        Create page later
      </button>
    </div>
  );
}
