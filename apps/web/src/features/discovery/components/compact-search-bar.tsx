"use client";

import { FormEvent, useId, useState } from "react";

import { EntitySearchResultsPanel } from "../../home-search/components/entity-search-results-panel";
import { useEntitySearch } from "../../home-search/hooks/use-entity-search";
import { useTranslation } from "../../i18n/locale-provider";

export function CompactSearchBar() {
  const t = useTranslation();
  const inputId = useId();
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="discovery-compact-search-wrap">
      <form className="discovery-compact-search" role="search" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor={inputId}>
          {t("web.homeFeed.compactSearchLabel")}
        </label>
        <input
          id={inputId}
          autoComplete="off"
          maxLength={200}
          placeholder={t("web.homeFeed.compactSearchPlaceholder")}
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

      <EntitySearchResultsPanel
        debouncedQuery={debouncedQuery}
        isDebouncing={isDebouncing}
        isError={isError}
        isFetching={isFetching}
        isPending={isPending}
        searchData={searchData}
        trimmedQuery={trimmedQuery}
      />
    </div>
  );
}
